// sanity/schemaTypes/project.ts
import { defineType, defineField } from "sanity";

export default defineType({
  name: "project",
  title: "Project",
  type: "document",
  fields: [
    // 1) Title
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),

    // 2) Slug
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),

    // 3) Type
    defineField({
      name: "type",
      title: "Type",
      type: "string",
      options: {
        list: [
          { title: "Residential", value: "residential" },
          { title: "Commercial", value: "commercial" },
          { title: "Hospitality", value: "hospitality" },
          { title: "Other", value: "other" },
        ],
      },
    }),

    // 4) Year
    defineField({
      name: "year",
      title: "Year",
      type: "number",
      validation: (Rule) => Rule.min(1900).max(new Date().getFullYear()),
    }),

    // 5) Size
    defineField({
      name: "size",
      title: "Size (sq ft)",
      type: "number",
    }),

    // (Optional) Location — placed after size; say the word and I’ll move it
    defineField({
      name: "location",
      title: "Location",
      type: "string",
    }),

    // 6) Description (rich text)
    defineField({
      name: "description",
      title: "Description",
      type: "array",
      of: [{ type: "block" }],
    }),

    // 7) Images (kept last, as requested)

    // Optional banner image (shown full‑bleed on the page)
    defineField({
      name: "heroImage",
      title: "Hero Image",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", title: "Alt text", type: "string" }],
    }),

    // Legacy / fallback main image
    defineField({
      name: "mainImage",
      title: "Main Image",
      type: "image",
      options: { hotspot: true },
      fields: [{ name: "alt", title: "Alt text", type: "string" }],
    }),

    // Gallery for the right-side grid
    defineField({
      name: "gallery",
      title: "Gallery",
      type: "array",
      of: [
        {
          type: "image",
          options: { hotspot: true },
          fields: [{ name: "alt", title: "Alt text", type: "string" }],
        },
      ],
      options: { layout: "grid" },
      validation: (Rule) =>
        Rule.min(1).warning("Add at least one gallery image"),
    }),
  ],

  preview: {
    select: {
      title: "title",
      media: "heroImage",
      year: "year",
      type: "type",
    },
    prepare({ title, media, year, type }) {
      const typeLabel =
        typeof type === "string" && type.length
          ? type.charAt(0).toUpperCase() + type.slice(1)
          : undefined;

      return {
        title,
        media,
        subtitle: [typeLabel, year].filter(Boolean).join(" • "),
      };
    },
  },
});
