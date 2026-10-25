# blog

Astro 기반 개인 학습/기록 블로그. GitHub Pages(`baobabnamu.github.io`)로 배포됩니다.

## 글 작성 흐름

1. `/drafts/`에서 markdown으로 초안 작성 (이 폴더는 git에 올라가지 않습니다).
2. 완성되면 `src/content/blog/<slug>.md`로 옮기고, 이미지가 있다면
   `src/assets/posts/<slug>/`에 같이 넣습니다.
3. frontmatter를 채우고 커밋/푸시하면 GitHub Actions가 자동으로 빌드 후
   GitHub Pages에 배포합니다.

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
