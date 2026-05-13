"""Background worker: drains the queue while worker_enabled is true."""

from __future__ import annotations

import asyncio
import logging
import traceback

from state import ServiceState

log = logging.getLogger("crawl4ai_worker")


async def crawl_one_url(url: str) -> tuple[str | None, str | None, str | None]:
    """Returns (markdown, raw_html, error_message)."""
    try:
        from crawl4ai import AsyncWebCrawler  # lazy import
    except ImportError as e:
        return None, None, f"crawl4ai_import_error: {e}"

    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            md = (
                getattr(result, "markdown", None)
                or getattr(result, "markdown_v2", None)
                or ""
            )
            html = (
                getattr(result, "html", None)
                or getattr(result, "cleaned_html", None)
                or ""
            )
            if getattr(result, "success", True) is False:
                err = getattr(result, "error_message", None) or "crawl_failed"
                return md, html, err
            return md, html, None
    except Exception as e:
        log.exception("crawl failed for %s", url)
        return None, None, f"{type(e).__name__}: {e}"


async def worker_loop(state: ServiceState) -> None:
    log.info("worker loop started")
    while state.worker_enabled:
        try:
            jid, url = await asyncio.wait_for(state.queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            break

        await state.mark_running(jid)
        md, html, err = await crawl_one_url(url)
        await state.mark_done(jid, markdown=md, html=html, error=err)
        state.queue.task_done()

    log.info("worker loop exiting")


def start_worker(state: ServiceState) -> None:
    if state.worker_task and not state.worker_task.done():
        return
    state.worker_task = asyncio.create_task(worker_loop(state), name="crawl4ai-worker")


async def stop_worker(state: ServiceState) -> None:
    state.worker_enabled = False
    t = state.worker_task
    state.worker_task = None
    if t and not t.done():
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
        except Exception:
            state.last_worker_error = traceback.format_exc()[-4000:]
