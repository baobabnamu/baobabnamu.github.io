# blog

Astro 기반 개인 학습/기록 블로그. GitHub Pages(`baobabnamu.github.io`)로 배포됩니다.

## 글 작성 흐름

글 쓰는 상황에 따라 두 가지 경로를 모두 지원합니다. 어느 경로로 시작하든
최종적으로는 같은 frontmatter 스키마 + 이미지 규칙을 따르는 markdown이
`src/content/blog/`에 커밋되는 지점에서 합쳐집니다.

### A. 바로 markdown으로 작성

학습하면서 바로 글로 정리하는 경우.

1. `/drafts/`에서 markdown으로 초안 작성 (이 폴더는 git에 올라가지 않습니다).
2. 완성되면 `src/content/blog/<slug>.md`로 옮기고, 이미지가 있다면
   `src/assets/posts/<slug>/`에 같이 넣습니다.
3. frontmatter를 채우고 커밋/푸시하면 GitHub Actions가 자동으로 빌드 후
   GitHub Pages에 배포합니다.

### B. Notion에서 정리 후 동기화 (예정, 미구현)

Notion에서 먼저 정리하는 경우. Notion은 에디터로만 쓰고, git이 계속
source of truth로 남도록 빌드 타임에 Notion API를 직접 호출하지 않습니다.

1. Notion에서 자유롭게 작성/정리.
2. 동기화 스크립트가 해당 Notion 페이지를 markdown으로 변환.
   - 이미지는 Notion의 업로드 URL이 만료되므로 스크립트가 다운로드해서
     `src/assets/posts/<slug>/`로 재배치하고 링크를 재작성합니다.
3. 변환 결과를 `src/content/blog/<slug>.md`로 커밋 — 이 지점부터는 A와 동일한
   흐름(frontmatter 확인 → push → 자동 배포).

> 동기화 스크립트는 아직 구현 전입니다. 진행 상황은 `TODO.md` 5번 참고.

### frontmatter 스키마 (`src/content.config.ts`)

| 필드           | 타입       | 필수 | 설명                                      |
| -------------- | ---------- | ---- | ----------------------------------------- |
| `title`        | string     | ✅   | 글 제목                                    |
| `description`  | string     | ✅   | 목록/SEO용 요약                            |
| `pubDate`      | date       | ✅   | 게시일 (`'2026-10-25'`)                    |
| `updatedDate`  | date       | ❌   | 수정일                                     |
| `heroImage`    | image path | ❌   | `../../assets/posts/<slug>/xxx.jpg`        |
| `tags`         | string[]   | ❌   | 기본값 `[]`                                |
| `draft`        | boolean    | ❌   | 기본값 `false`. 실수로 커밋됐을 때의 안전장치 — 평소엔 `/drafts/`로 비공개를 관리하고, 이 플래그에 의존하지 않습니다. |

예시는 `src/content/blog/hello-world.md` 참고.

### 이미지

- 포스트별로 `src/assets/posts/<slug>/` 폴더를 만들어 그 안에 둡니다.
- 본문에서는 상대 경로 markdown 문법(`![alt](../../assets/posts/<slug>/foo.jpg)`)을
  그대로 쓰면 Astro가 자동으로 최적화/리사이즈합니다.

### 코드 블록

언어를 명시한 fenced code block(` ```ts `, ` ```bash ` 등)을 쓰면 Astro 기본
Shiki 하이라이터가 자동으로 적용됩니다. 별도 설정 불필요.

### 강조(bold) 작성 시 주의

`**굵게**`가 inline code(`` ` `` ... `` ` ``)로 바로 끝나고, 닫는 `**` 뒤에
공백/문장부호 없이 글자가 바로 붙으면 CommonMark 스펙상 `**`가 emphasis
종료로 인식되지 않아 `**` 문자가 그대로 노출됩니다.

```md
❌ **`powersave`**로 동작했다   →  **`powersave`**로 가 그대로 노출됨
✅ `powersave`로 동작했다       →  굵게가 꼭 필요하지 않으면 강조 자체를 빼거나
✅ **`powersave`** 상태로 동작했다 →  닫는 ** 뒤에 공백을 둔다
```

굵게 강조가 코드/백틱으로 끝나야 한다면, 뒤에 공백이나 문장부호를 하나 두거나
문장을 바꿔서 코드 다음에 공백 없이 글자가 바로 붙지 않게 합니다. 애매하면
`npm run build` 후 결과 HTML에서 `<strong>`으로 변환됐는지 확인합니다.

### 용어 설명은 괄호 대신 각주로

문장 중간에 `용어(긴 설명...)` 식으로 괄호를 넣으면 본문 흐름이 끊깁니다.
독자가 모를 만한 용어는 괄호 대신 GFM 각주(footnote)로 분리합니다 — Astro
기본 마크다운 파이프라인(remark-gfm)이 별도 설정 없이 지원합니다.

```md
❌ CPU governor(커널이 CPU 클럭 속도를 올리고 내리는 정책)가 기본값이었다
✅ CPU governor[^governor]가 기본값이었다

...(문서 하단)...
[^governor]: 커널이 CPU 클럭 속도를 자동으로 올리고 내리는 전력 관리 정책.
```

각주 정의(`[^label]: ...`)는 파일 아무 곳에 둬도 되지만, 가독성을 위해
파일 맨 끝(참고자료 앞뒤)에 모아 씁니다. 렌더링되면 본문엔 위첨자 번호만
남고, 설명은 글 끝 "Footnotes" 섹션에 모여 번호를 클릭하면 이동/복귀됩니다.

## 배포

- `main` 브랜치에 push되면 `.github/workflows/deploy.yml`이 빌드 후 GitHub
  Pages로 배포합니다.
- repo Settings → Pages → Source를 **GitHub Actions**로 설정해야 합니다.

## 로컬 개발

| Command           | Action                                  |
| ------------------ | ---------------------------------------- |
| `npm install`       | 의존성 설치                               |
| `npm run dev`       | `localhost:4321` 개발 서버                |
| `npm run build`     | `./dist/`로 프로덕션 빌드                 |
| `npm run preview`   | 빌드 결과 로컬 프리뷰                     |

## 커밋 컨벤션

`post:`, `site:`, `ci:`, `chore:`, `fix:`, `docs:` prefix를 사용합니다.
main에 직접 커밋/푸시합니다 (개인 블로그, PR 오버헤드 없음).
