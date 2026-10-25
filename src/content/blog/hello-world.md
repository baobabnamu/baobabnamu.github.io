---
title: '블로그를 시작하며'
description: 'Tistory에서 GitHub 기반 블로그로 옮긴 이유와, 글쓰기 규칙 정리'
pubDate: '2026-10-25'
heroImage: '../../assets/posts/hello-world/cover.jpg'
tags: ['meta']
draft: false
---

Tistory에 학습 내용을 올리면서 매번 markdown으로 먼저 정리한 뒤 다시 Tistory
에디터용으로 옮기는 과정이 반복됐습니다. 이제는 이 repo에 markdown으로 쓰면
그대로 사이트에 반영되는 구조로 바꿨습니다.

## 글 쓰는 규칙

- 초안은 `/drafts/`에서 작업하고, 완성되면 `src/content/blog/`로 옮겨서 커밋합니다.
- 이미지는 포스트별 폴더 `src/assets/posts/<slug>/`에 넣고 상대 경로로 참조합니다.
- frontmatter에는 `title`, `description`, `pubDate`, 필요 시 `updatedDate`,
  `heroImage`, `tags`를 채웁니다. `draft: true`는 실수로 커밋됐을 때를 위한
  안전장치일 뿐, 기본 작업 흐름은 `/drafts/`로 막습니다.

본문 중간에 이미지를 넣을 때는 아래처럼 상대 경로 markdown 문법을 그대로 쓰면
Astro가 자동으로 최적화합니다.

![예시 다이어그램](../../assets/posts/hello-world/diagram.jpg)

## 코드 블록 예시

언어를 명시하면 Shiki가 자동으로 하이라이팅합니다.

```ts
interface Post {
  title: string;
  tags: string[];
  draft: boolean;
}

function isPublishable(post: Post): boolean {
  return !post.draft;
}
```

```bash
# 새 포스트 작성 흐름
mkdir -p src/assets/posts/my-new-post
mv drafts/my-new-post.md src/content/blog/
git add src/content/blog/my-new-post.md src/assets/posts/my-new-post
git commit -m "post: my-new-post"
```
