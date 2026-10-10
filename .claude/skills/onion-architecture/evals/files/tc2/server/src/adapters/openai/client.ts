import OpenAI from 'openai';

export class OpenAICompletionClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(prompt: string, model = 'gpt-4o-mini'): Promise<string> {
    const res = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0]?.message.content ?? '';
  }
}
