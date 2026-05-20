import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function tagList(post: Post): string[] {
  const raw = post.data.tags;
  if (!raw) return [];
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

export function category(post: Post): string {
  const tags = tagList(post);
  return tags[0] ?? 'Post';
}

export function readTime(post: Post): string {
  const words = post.body ? post.body.trim().split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min`;
}

export function excerpt(post: Post): string {
  if (post.data.seoDescription) return post.data.seoDescription;
  if (!post.body) return '';
  const stripped = post.body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .trim();
  const firstPara = stripped.split(/\n\n+/).find((p) => p.length > 40) ?? stripped;
  return firstPara.length > 200 ? firstPara.slice(0, 200).trimEnd() + '…' : firstPara;
}
