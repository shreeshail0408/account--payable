import React from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function isChunkLoadError(error) {
  const message = String(error?.message || "");
  return error?.name === "ChunkLoadError"
    || /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

/*
 * Catches render errors (and failed lazy-chunk loads) for one route. Resets when
 * `resetKey` changes, so navigating away clears the error. A failed chunk can't be
 * retried in place (React.lazy caches the rejection), so that case offers a reload.
 */
export class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Route render failed", error, info?.componentStack);
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  retry() {
    if (isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    const chunkError = isChunkLoadError(error);
    return (
      <div data-ui="" className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
        <div role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-warning-border bg-warning-subtle text-warning-subtle-foreground">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold tracking-tight">
              {chunkError ? "This page needs a refresh" : "This page couldn't be displayed"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {chunkError
                ? "A newer version of the app may have been released, or the connection dropped while loading. Reloading usually fixes it."
                : "Something went wrong while showing this page. Your data hasn't been changed. Try again, or go back to the dashboard."}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={this.retry}>
              <RefreshCw />
              {chunkError ? "Reload page" : "Try again"}
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>
              Go to dashboard
            </Button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
              {String(error?.stack || error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
