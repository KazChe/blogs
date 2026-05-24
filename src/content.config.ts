import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Accept full URLs (https://…) or site-absolute paths (/images/…).
const urlOrPath = z
  .string()
  .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), {
    message: 'must be an absolute URL or a path starting with /',
  });

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    datePublished: z.coerce.date(),
    cover: urlOrPath,
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    ogImage: urlOrPath.optional(),
    tags: z.string().optional(),
  }),
});

export const collections = { posts };
