// Patch file for updating routes.ts to use DeepSeek instead of OpenAI
// Apply these changes to routes.ts

// Line 325: Change OpenAI import to DeepSeek
// Original: const { openai } = await import("./openai");
// New: const { deepseek, getModelForTask } = await import("./deepseek");

// Line 415-416: Change model from "gpt-4o" to DeepSeek model
// Original: 
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o",
// New:
//   const response = await deepseek.chat.completions.create({
//     model: getModelForTask("moderate"),

// Line 782: Change OpenAI import to DeepSeek
// Original: const { openai } = await import("./openai");
// New: const { deepseek, getModelForTask } = await import("./deepseek");

// Line 893-894: Change model from "gpt-4o" to DeepSeek model
// Original:
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o",
// New:
//   const response = await deepseek.chat.completions.create({
//     model: getModelForTask("moderate"),

// Line 3980-3981: Change chatWithAI to chatWithDeepSeek
// Original:
//   const { chatWithAI } = await import("./openai");
//   const result = await chatWithAI(messages, req.session.userId!);
// New:
//   const { chatWithDeepSeek, getModelForTask } = await import("./deepseek");
//   const result = await chatWithDeepSeek(messages, req.session.userId!, getModelForTask("moderate"));

// Line 4088: Change OpenAI import to DeepSeek
// Original: const { openai } = await import("./openai");
// New: const { deepseek, getModelForTask } = await import("./deepseek");

// Line 4127-4128: Change model from "gpt-4o" to DeepSeek model
// Original:
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o",
// New:
//   const response = await deepseek.chat.completions.create({
//     model: getModelForTask("complex"), // Investment advice is complex

// Line 4263: Change OpenAI import to DeepSeek
// Original: const { openai } = await import("./openai");
// New: const { deepseek, getModelForTask } = await import("./deepseek");

// Line 4298-4299: Change model from "gpt-4o" to DeepSeek model
// Original:
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o",
// New:
//   const response = await deepseek.chat.completions.create({
//     model: getModelForTask("moderate"),

// Line 4409: Change OpenAI import to DeepSeek
// Original: const { openai } = await import("./openai");
// New: const { deepseek, getModelForTask } = await import("./deepseek");

// Line 4467-4468: Change model from "gpt-4o" to DeepSeek model
// Original:
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o",
// New:
//   const response = await deepseek.chat.completions.create({
//     model: getModelForTask("simple"), // Sales chatbot can be simple

// Line 4597: Change OpenAI import to DeepSeek
// Original: const { openai } = await import("./openai");
// New: const { deepseek, getModelForTask } = await import("./deepseek");

// Line 4640-4641: Change model from "gpt-4o" to DeepSeek model
// Original:
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o",
// New:
//   const response = await deepseek.chat.completions.create({
//     model: getModelForTask("moderate"),

// Also update sales-chatbot.ts to use DeepSeek
// File: /root/.openclaw/workspace/budgetsmart-code/server/sales-chatbot.ts
// Line with OpenAI import needs to be updated

// Environment variables needed:
// DEEPSEEK_API_KEY - Get from https://platform.deepseek.com/api_keys
// Can fall back to OPENAI_API_KEY if DEEPSEEK_API_KEY is not set

// Cost comparison:
// GPT-4o: ~$5-10 per 1M tokens
// DeepSeek Chat: ~$0.14 per 1M tokens (70x cheaper)
// DeepSeek Reasoner: ~$0.28 per 1M tokens (35x cheaper)