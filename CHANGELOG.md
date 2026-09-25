# Changelog

All notable changes to `@typesearch/ai-sdk` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First release.

- `newsSearch()`, `getContents()` and `findSimilar()` for the AI SDK (`ai` 6 and 7), with the parameters,
  limits and descriptions of the typesearch MCP tools.
- Compact output: structured data for your code and a short text list for the model (`modelOutput: 'json'`
  sends the data instead).
- Filters fixed in the config (`countries`, `languages`, `includeDomains`, `excludeDomains`) are always
  applied and hidden from the model.
- The client is created on the first call: defining the tools never fails without a key.
- API errors reach the model as readable tool errors, with the `typesearch-js` error as `cause`.
- ESM and CommonJS, fully typed.
