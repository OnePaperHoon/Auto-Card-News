# Explain.md — 이 레포 한눈에 이해하기

> **Auto Card News** (`auto-card-news`, v0.5.1)
> 소스 링크 하나를 던지면 → **인스타 카드뉴스 + 릴스 플랜 + 캡션 + 출처 팩**으로 패키징해주는
> **Agent Skill 샘플 레포**입니다.

이 레포는 자체적으로 돌아가는 앱이나 서버가 아닙니다. **Codex / Claude Code 같은 AI 에이전트에게 "이렇게 일하라"고 가르치는 지침서(Skill) 묶음**과, 그 지침서를 에이전트에 설치해주는 작은 CLI로 구성되어 있습니다. 실제 콘텐츠 제작은 설치된 에이전트가 이 지침을 읽고 수행합니다.

---

## 1. 각 폴더가 무엇을 하는가

```
OnePaperHoon-AI-Card-News/
├── cli/                  ← 스킬 설치용 인터랙티브 CLI (핵심 실행 코드)
├── skills/               ← 레포의 본체. AI 에이전트용 지침서(Agent Skills)
│   ├── content-engine/   ← 최상위 품질 게이트 (메모리 레이어)
│   ├── auto-card-news/            ← 카드뉴스/캐러셀 제작 워크플로우
│   └── auto-motion-news/          ← 릴스/숏폼 모션 영상 제작 워크플로우
├── docs/                 ← 퀵스타트 문서, 다국어 README, 설계 문서, 쇼케이스 이미지
├── examples/             ← 복붙용 예시 프롬프트
├── tools/                ← 과거 실제 프로젝트를 렌더링했던 일회성 빌드 스크립트
├── tests/                ← 스킬 메타데이터/구조 검증 유닛테스트 (Python)
├── install*.sh / *.ps1   ← 원라인 설치 스크립트 (curl/iwr 로 받아 실행)
├── package.json          ← npm 스크립트 (cli, list, test) 및 메타
├── AGENTS.md             ← 에이전트 기본 말투/페르소나 정의 ("귀여운 AI 튜터")
├── README.md             ← 프로젝트 소개 (영문, 다국어 링크 포함)
├── CHANGELOG.md / VERSION
└── .gitignore            ← carousel-workspace/ 등 실제 작업 산출물은 git 제외
```

### 폴더별 상세

- **`cli/`** — `index.mjs` 하나. 의존성 없는(zero-dependency) Node 스크립트로, `skills/` 폴더들을 Claude Code(`~/.claude/skills`) 또는 Codex(`~/.codex/skills`)로 복사 설치합니다. 이 레포에서 **실제로 "실행"되는 코드는 사실상 이것뿐**입니다.

- **`skills/`** — 레포의 핵심 자산. 각 스킬은 `SKILL.md`(에이전트가 읽는 지침 본문) + `references/`(상세 규칙) + `assets/templates/`(산출물 마크다운 템플릿) + `scripts/`(프로젝트 스캐폴딩·페르소나 샘플링 파이썬) + `agents/openai.yaml`(Codex용 메타)로 구성됩니다.

- **`docs/`** — `codex-quickstart.md`, `claude-code-quickstart.md`, 다국어 README(`i18n/`), 설계 스펙·플랜(`superpowers/`), README에 박히는 쇼케이스 PNG/SVG(`assets/`), 외부 참고 스킬(`external/video-use/`).

- **`examples/`** — `one-link-ai-news-prompt.md`. 설치 후 그대로 복사해 쓰는 Codex/Claude용 프롬프트 예시.

- **`tools/`** — `build-*.mjs` / `rework-*.mjs` 등. Puppeteer + Chrome + ffmpeg로 특정 과거 프로젝트(VibeVoice, Hermes, Codex Pets 등)의 카드 PNG·릴스 MP4를 실제로 찍어냈던 **일회성 자동화 스크립트**입니다. 작업 결과물이 들어가는 `carousel-workspace/`는 `.gitignore`로 제외되어 있어, 이 스크립트들은 참고/재현용 기록에 가깝습니다.

- **`tests/`** — `test_auto_card_news_skill.py`. 세 스킬의 YAML 프론트매터, 필수 레퍼런스/템플릿/스크립트 존재 여부, 설치 문서, 배포 파일 등을 검증합니다. (`python -m unittest tests.test_auto_card_news_skill -v`)

---

## 2. 중요 코드 파일에는 무엇이 들어있는가

### `cli/index.mjs` — 설치 CLI의 전부
- **타깃 정의**: `claude`(`~/.claude/skills`), `codex`(`~/.codex/skills`). 환경변수 `CLAUDE_HOME`/`CODEX_HOME`로 경로 오버라이드 가능.
- **`discoverSkills()`**: `skills/` 하위에서 `SKILL.md`를 가진 폴더를 자동 탐색하고 description을 파싱.
- **인터랙티브 프롬프트**: 어디에 설치할지(1/2/3) → 어떤 스킬을(번호 or `a`) → 컴패니언(`last30days`) 설치 여부 → 확인.
- **`installSkill()`**: 대상 폴더를 통째로 `cpSync`로 복사(기존 것은 삭제 후 덮어씀).
- **`fetchCompanion()`**: 외부 스킬 `last30days`를 git clone으로 받아 함께 설치(git 없으면 건너뜀).
- **비대화 모드**: `--target`, `--skills`, `--yes`, `--dest`, `--list`, `--help` 플래그로 CI/스크립트에서 사용 가능.
- 핵심 메시지: *"이건 MCP 서버가 아니라 Agent Skill이라 MCP 설정이 필요 없다. 폴더만 제 위치에 두면 에이전트가 이름으로 불러 쓴다."*

### `skills/content-engine/SKILL.md` — 최상위 품질 게이트
- 다른 두 스킬을 **대체하지 않고**, 채널의 학습된 기준(과거 실험·피드백)을 강제하는 "메모리 레이어".
- 필수 스킬 스택을 먼저 읽도록 강제하고, 기본 제작 플로우(소스 검증 → 앵글 선택 → 카드+릴스 동시 제작 → 비주얼 증거 → 카피 휴머나이즈 → QA)를 정의.
- **Hard Fails**(첫 장이 README 스크린샷일 때, 카피가 번역체일 때 등)와 최종 산출물 체크리스트를 명시.

### `skills/auto-card-news/SKILL.md` — 카드뉴스 제작 본체 (가장 방대)
- 폰트 규칙(`Griun Mongtori` / Viral V2는 `GmarketSans`), 레이아웃 QA, 인스타 타이포그래피 기준(1080×1350, 폰트 px 스케일), HERMES 에디토리얼 패턴, 7카드 기본 구조, 소스 미디어/모션 필수 요건, 휴머나이즈 한국어 QA 게이트, 한국어 페르소나 QA, 퍼블리싱 자동화 규칙 등 **제작 전 과정의 규칙 사전**.
- `references/`의 11개 세부 문서(프로덕션 플레이북, 디자인, 휴머나이즈, 바이럴 V2 스타일 등)를 상황별로 읽도록 연결.

### `skills/auto-motion-news/SKILL.md` — 릴스/모션 제작 본체
- 카드뉴스와 동일한 폰트·룩을 유지하면서 0–2초 훅 / 2–14초 설명 / 14–20초 CTA 구조를 강제.
- HyperFrames 우선, Remotion 폴백의 모션 엔진 선택 규칙, 녹화 영상 편집 모드 등.

### `skills/auto-card-news/scripts/init_project.py` — 프로젝트 스캐폴딩
- `carousel-workspace/profiles/<채널>/...`와 `projects/<채널>/<날짜-주제>/...` 폴더 구조를 템플릿(`assets/templates/*.md`) 기반으로 생성.
- `source.md`, `source-pack.md`, `brief.md`, `storyboard.md`, `motion-plan.md`, `index.html`, `cards/card-01.html`, `output/` 등을 초기화.

### `AGENTS.md` — 에이전트 페르소나
- 기본 톤을 "귀엽고 살짝 과몰입하는 AI 튜터"(`~해욤`, `헉` 등)로 정의하되, 돈·법·보안 등 진지한 영역에선 정확성 우선.

---

## 3. 사용자가 최종적으로 얻는 산출물

스킬을 설치한 에이전트에 소스 링크를 주면, **하나의 "발행 직전" 콘텐츠 패키지**(프로젝트 폴더)를 얻습니다:

```
source.md            소스 요약 + 링크
source-pack.md       공식/커뮤니티/미디어/검증 노트
brief.md             시청자 프레임(누가 멈추는가/무엇이 쉬워지는가)
storyboard.md        카드별 카피 + 비주얼 역할
humanize-input.md    / humanize-report.md   한국어 휴머나이즈 QA 기록
motion-plan.md       카드별 정적/모션 결정, 엔진 선택
caption.md           인스타 캡션 + 출처 링크 + CTA
design.md            디자인/팔레트 결정
cards/               카드별 HTML/CSS
output/
  card-01.png ~ card-07.png    카드뉴스 PNG
  reel.mp4 / reel-preview.mp4  릴스/숏폼 영상
  contact-sheet.png            전체 카드 한 장 모음
  thumbnail-sheet.png          인스타 그리드 1:1 크롭 미리보기
publish-queue.json / publish-checklist.md   (퍼블리싱 요청 시)
```

요약하면: **카드뉴스 캐러셀 + 릴스 플랜/영상 + 캡션 + 검증된 출처 + 비주얼 방향 + QA 체크리스트.**

> ⚠️ **이 레포가 하지 않는 것**: 호스팅 SaaS가 아니며, 인스타/스레드/유튜브/틱톡에 **자동 업로드하지 않습니다.** 업로드는 공식 플랫폼 API 자격증명이 따로 있어야 하고, 스킬은 자산과 캡션 준비까지만 책임집니다.

---

## 4. 사용법

### 사전 준비
- Node.js 16+ (CLI용)
- Codex 또는 Claude Code (실제 콘텐츠 제작 에이전트)
- 실제 렌더링까지 하려면 에이전트 환경에 브라우저(Chrome/Puppeteer), ffmpeg, HyperFrames/Remotion 등이 필요(환경 의존적)

### 설치 — 방법 A: 인터랙티브 CLI (레포 클론 시 권장)
```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd Auto-card-news
npm run cli
```
설치 위치(Claude/Codex/둘 다), 설치할 스킬, `last30days` 컴패니언 여부를 물어봅니다.

비대화(스크립트/CI)용:
```bash
npm run cli -- --target both --skills all --yes
npm run cli -- --target claude --skills auto-card-news,auto-motion-news --yes
npm run cli -- --list                       # 설치 가능 목록 확인
CLAUDE_HOME=~/work/.claude npm run cli -- --target claude --yes
```
플래그: `--target <claude|codex|both>`, `--skills <all|name,...>`, `--companion`/`--no-companion`, `--dest <dir>`, `-y/--yes`, `-l/--list`, `-h/--help`

### 설치 — 방법 B: 원라인 스크립트
```powershell
# Codex (Windows)
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/install.ps1 | iex"
# Claude Code (Windows)
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/install-claude.ps1 | iex"
```
```bash
# macOS / Linux — Codex
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/install.sh | bash
# macOS / Linux — Claude Code
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/master/install-claude.sh | bash
```
설치 후 **에이전트를 재시작**해야 스킬이 인식됩니다.

### 설치 — 방법 C: 수동
`skills/content-engine`, `skills/auto-card-news`, `skills/auto-motion-news` 폴더를 각각
`~/.codex/skills/` 또는 `~/.claude/skills/`에 복사. (권장 컴패니언: `last30days`)

### 사용 — Codex
```text
$content-engine
<소스 URL>

카드뉴스 자동화로 만들어줘.
카드뉴스 7장, 릴스 플랜, 캡션, 출처 링크까지.
첫 장은 실제 사용 장면/제품 이미지 중심으로 후킹되게.
```
`$auto-card-news`, `$auto-motion-news`도 직접 호출 가능.

### 사용 — Claude Code
```text
Use the content-engine skill.

Source:
https://github.com/microsoft/markitdown

Make an 채널 스타일 Korean card-news package:
- 7-card carousel
- Reel plan
- caption / source links / visual references
- no stiff translated Korean, explain why viewers should care
```

### 검증(개발자용)
```powershell
python -m unittest tests.test_auto_card_news_skill -v
```
스킬 메타데이터·레퍼런스·템플릿·스캐폴드 스크립트·설치 문서·배포 파일을 점검합니다.

---

## 핵심 제작 철학 (요약)
- **훅 먼저.** 첫 카드 / 첫 3초가 시청자를 멈추게 해야 함.
- **PPT 슬라이드 금지.** 실제 데모·제품 스크린샷·생성 비주얼 사용.
- **기술명부터 설명하지 말 것.** 시청자 상황과 결과부터.
- **번역체 한국어 금지.** 짧고 자연스럽고 쓸모 있게.
- **카드뉴스만으로는 약하다 → 릴스까지 함께.**
- **AX 컨설팅 브릿지**: "이게 회사/크리에이터/개발자에게 어떻게 도움 되는가"로 연결.
