import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    datePublished: z.coerce.date(),
    cuid: z.string(),
    slug: z.string(),
    cover: z.string().url(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    ogImage: z.string().url().optional(),
    tags: z.string().optional(),
  }),
});

export const collections = { posts };
