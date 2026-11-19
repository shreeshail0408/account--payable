from django.contrib import admin
import os

from django.urls import include, path, re_path
from django.views.static import serve
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("ap_app.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# static() only serves media while DEBUG is on. Small single-server deployments (e.g. the Render
# blueprint) opt in with AP_SERVE_MEDIA=true so invoice files keep loading in the review screen.
if not settings.DEBUG and os.getenv("AP_SERVE_MEDIA", "false").lower() == "true":
    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    ]
