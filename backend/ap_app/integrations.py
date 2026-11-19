import json
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlparse

from .models import IntegrationDelivery

logger = logging.getLogger(__name__)


class IntegrationNotConfigured(Exception):
    pass


class IntegrationRequestFailed(Exception):
    pass


def send_integration_payload(provider, entity_type, entity_id, payload, actor, idempotency_key):
    provider = provider.upper()
    endpoint = os.getenv(f"{provider}_API_URL", "").strip()
    token = os.getenv(f"{provider}_API_TOKEN", "").strip()
    if not endpoint or not token:
        raise IntegrationNotConfigured(
            f"{provider} integration is not configured. Set {provider}_API_URL and {provider}_API_TOKEN."
        )
    parsed_endpoint = urlparse(endpoint)
    if parsed_endpoint.scheme != "https" or not parsed_endpoint.hostname or parsed_endpoint.username or parsed_endpoint.password:
        raise IntegrationNotConfigured(f"{provider} endpoint must be a valid HTTPS URL without embedded credentials.")

    encoded = json.dumps(payload, default=str).encode("utf-8")
    request = Request(
        endpoint,
        data=encoded,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        },
        method="POST",
    )
    response_status = None
    summary = ""
    delivery_status = IntegrationDelivery.Status.FAILED
    try:
        with urlopen(request, timeout=15) as response:
            response_status = response.status
            response.read(500)
            summary = "Provider accepted the request."
            delivery_status = IntegrationDelivery.Status.SUCCEEDED
            if not 200 <= response_status < 300:
                delivery_status = IntegrationDelivery.Status.FAILED
    except HTTPError as exc:
        response_status = exc.code
        summary = f"Provider returned HTTP {exc.code}."
        logger.warning("%s provider rejected %s %s: HTTP %s", provider, entity_type, entity_id, exc.code)
    except (URLError, TimeoutError, OSError) as exc:
        summary = f"Could not reach {provider} provider: {exc.reason if isinstance(exc, URLError) else exc}"
        logger.warning("%s provider request failed for %s %s: %s", provider, entity_type, entity_id, exc)

    IntegrationDelivery.objects.update_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "provider": provider,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "status": delivery_status,
            "response_status": response_status,
            "response_summary": summary[:500],
            "attempted_by": actor,
        },
    )
    if delivery_status != IntegrationDelivery.Status.SUCCEEDED:
        raise IntegrationRequestFailed(summary or f"{provider} request was not successful.")
    return response_status, summary
