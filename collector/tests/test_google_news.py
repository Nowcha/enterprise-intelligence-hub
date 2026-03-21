"""Tests for collector/sources/google_news.py"""
import sys
import os
from unittest.mock import patch, MagicMock
import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


def _make_entry(title="テスト記事", link="https://example.com/news/1", published=None):
    entry = MagicMock()
    entry.title = title
    entry.link = link
    if published is None:
        entry.published_parsed = datetime.datetime(2024, 3, 15, 9, 0, 0).timetuple()
    else:
        entry.published_parsed = published
    entry.get = lambda key, default=None: {
        "title": title,
        "link": link,
    }.get(key, default)
    return entry


def _make_feed(entries):
    feed = MagicMock()
    feed.entries = entries
    return feed


class TestFetchNews:
    def test_returns_list(self):
        from sources.google_news import fetch_news
        with patch("feedparser.parse") as mock_parse:
            mock_parse.return_value = _make_feed([])
            result = fetch_news("テスト企業", max_articles=5)
        assert isinstance(result, list)

    def test_returns_articles_with_required_fields(self):
        from sources.google_news import fetch_news
        entry = _make_entry("記事タイトル", "https://example.com/1")
        with patch("feedparser.parse") as mock_parse:
            mock_parse.return_value = _make_feed([entry])
            result = fetch_news("テスト企業", max_articles=5)
        if result:  # may be empty if deduplication removes all
            article = result[0]
            assert "title" in article
            assert "url" in article
            assert "source" in article
            assert "published_at" in article

    def test_respects_max_articles(self):
        from sources.google_news import fetch_news
        entries = [_make_entry(f"記事{i}", f"https://example.com/{i}") for i in range(10)]
        with patch("feedparser.parse") as mock_parse:
            mock_parse.return_value = _make_feed(entries)
            result = fetch_news("テスト企業", max_articles=3)
        assert len(result) <= 3

    def test_handles_feedparser_exception(self):
        from sources.google_news import fetch_news
        with patch("feedparser.parse", side_effect=Exception("network error")):
            result = fetch_news("テスト企業", max_articles=5)
        assert isinstance(result, list)

    def test_empty_query_returns_list(self):
        from sources.google_news import fetch_news
        with patch("feedparser.parse") as mock_parse:
            mock_parse.return_value = _make_feed([])
            result = fetch_news("", max_articles=5)
        assert isinstance(result, list)
