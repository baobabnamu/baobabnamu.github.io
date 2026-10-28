# blog

Bao의 기술 블로그. [Print](https://github.com/riceball-tw/print) 테마를 베이스로
한국어 전용, URL에 언어 프리픽스 없이(`/ko/` 없음) 운영합니다. GitHub Pages
(`baobabnamu.github.io`)로 배포됩니다.

## 글 작성 흐름

1. `templates/post/index.md`를 `/drafts/<slug>/index.md`로 복사해 초안 작성
   (`/drafts/`는 git에 올라가지 않습니다). 주제와 상관없이 제목 단계·서식은 이 템플릿을
   따릅니다 — 규칙은 `AGENTS.md`의 "Writing posts" 참고.
2. 완성되면 `src/content/post/ko/<slug>/index.md`로 옮깁니다.
3. frontmatter를 채우고 커밋/푸시하면 Test → Deploy 워크플로가 순서대로 돌아
   GitHub Pages에 배포합니다.

### frontmatter 스키마 (`src/content.config.ts`의 `postSchema`)

```md
---
isDraft: false
headline: "글 제목"
subHeadline: "부제목 — 한 줄 요약"
excerpt: "목록/SEO용 짧은 설명"
category: "OPS" # OPS | DEV | AI
publishDate: 2026-01-01
---
```

`isDraft: true`(기본값)인 글은 `pnpm dev`에서는 보이지만 프로덕션 빌드에서는
제외됩니다 — `/drafts/`와 별개의 2차 안전장치입니다.

### 짧은 글(note)

`src/content/note/ko/<slug>/index.md`에 `headline`/`publishDate`/`category`만
채워서 올리면 `/notes/`에 피드 형태로 보입니다.

## Features

- **TUI 미학** — 모노스페이스, `[bracketed]` 내비게이션, 라이트/다크 테마
- **Mermaid 다이어그램** — 빌드타임에 정적 SVG로 렌더링(클라이언트 JS 0)
- **Expressive Code** — 구문 강조, 에디터/터미널 프레임, 라인 마커, 복사 버튼
- **글/노트 두 가지 콘텐츠 타입** — 각각 목록/상세/카테고리 페이지 보유

## Commands

| Command          | Action                                         |
| :--------------- | :--------------------------------------------- |
| `pnpm dev`       | `localhost:4321` 개발 서버                      |
| `pnpm build`     | `./dist/`로 프로덕션 빌드                        |
| `pnpm preview`   | 빌드 결과 로컬 프리뷰                            |
| `pnpm test`      | Vitest 단위 테스트                               |
| `pnpm test:e2e`  | 빌드 후 Playwright E2E 테스트                    |
| `pnpm typecheck` | `astro check`                                   |
| `pnpm lint`      | oxlint                                          |
| `pnpm fmt`       | oxfmt로 포매팅                                   |

### Customization

| What                        | Where                                   |
| :-------------------------- | :--------------------------------------- |
| 사이트 설정(브랜드, 내비, 소셜) | `src/data/config.json`                  |
| 글 / 노트                    | `src/content/post`, `src/content/note`  |
| 번역 문자열 (현재 ko만)        | `src/i18n/ui.ts`                        |
| 스타일/토큰                  | `src/styles/global.css`                 |
| Expressive Code 테마         | `ec.config.mjs`                         |
| 배포 base path               | `astro.config.mjs` / `src/utils/base.ts` |

## 배포

- `main`에 push되면 `.github/workflows/test.yml`(typecheck + unit + e2e)이
  먼저 돌고, 성공하면 `.github/workflows/deploy.yml`이 자동으로 이어서
  GitHub Pages에 배포합니다.
- 루트 도메인(`baobabnamu.github.io`)으로 배포하므로 repo 변수
  `PUBLIC_BASE_URL`은 설정하지 않습니다(비워두면 자동으로 루트 도메인으로
  리졸브됩니다 — `src/utils/base.ts` 참고).
- repo Settings → Pages → Source는 **GitHub Actions**로 설정합니다.

## Project Structure

```text
/
├── drafts/              # 초안 (gitignored)
├── private/             # Tistory export 등 임시 스테이징 (gitignored)
├── e2e/                 # Playwright E2E 테스트
├── public/              # 정적 에셋 (favicon, 이미지)
├── src/
│   ├── components/      # Astro 컴포넌트
│   ├── content/         # post, note 콘텐츠
│   ├── data/            # 사이트 설정 (config.json)
│   ├── i18n/            # 번역 문자열 (ko)
│   ├── layouts/         # 페이지 셸
│   ├── pages/           # 라우트
│   ├── styles/          # global.css
│   └── utils/           # 순수 헬퍼 함수
├── astro.config.mjs
├── ec.config.mjs
├── playwright.config.ts
└── vitest.config.ts
```

## 커밋 컨벤션

`post:`, `site:`, `ci:`, `test:`, `chore:`, `fix:`, `docs:` prefix를
사용합니다. main에 직접 커밋/푸시합니다.

## 원본 테마

이 저장소는 [riceball-tw/print](https://github.com/riceball-tw/print)
(MIT License)를 포크해 한국어 전용으로 포팅한 것입니다.
