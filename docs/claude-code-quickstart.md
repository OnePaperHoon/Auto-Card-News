# Claude Code Quickstart

Use this guide when you want to install the Auto Card News skills in Claude Code.

## Install

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/install-claude.ps1 | iex"
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/install-claude.sh | bash
```

Restart Claude Code after installation.

## Prompt

```text
Use the content-engine skill.

Source:
https://github.com/microsoft/markitdown

Create an 채널 스타일 Korean AI news package:
- 7-card carousel
- Reel plan
- compact caption
- source links
- real product screenshots or demo references
- Korean copy that sounds natural, not translated
- viewer-first hook
```

## Notes

The skill folders use `SKILL.md`, so Claude Code can read the same production rules as Codex. The `agents/openai.yaml` files are Codex-specific helper prompts; Claude Code can ignore them.
