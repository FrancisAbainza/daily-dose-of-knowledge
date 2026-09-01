import z from "zod";

export const triviaSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const vocabularySchema = z.object({
  word: z.string(),
  definition: z.string(),
});

export const quoteSchema = z.object({
  quote: z.string(),
});