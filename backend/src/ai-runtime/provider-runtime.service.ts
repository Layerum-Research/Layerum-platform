import { Injectable } from '@nestjs/common';
import { normalizeSafeOutboundBaseUrl } from '../common/security/outbound-url-policy';

type RuntimeConfig = Record<string, unknown> | null | undefined;

type ChatInput = {
  provider: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  providerConfig?: RuntimeConfig;
};

type EmbeddingInput = {
  provider: string;
  apiKey: string;
  model: string;
  input: string | string[];
  providerConfig?: RuntimeConfig;
};

type ChatOutput = {
  text: string;
  usage?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  };
};

@Injectable()
export class ProviderRuntimeService {
  async generateChat(input: ChatInput): Promise<ChatOutput> {
    const provider = input.provider;
    if (provider === 'anthropic') {
      return this.generateAnthropicChat(input);
    }
    if (provider === 'cohere') {
      return this.generateCohereChat(input);
    }
    if (provider === 'google') {
      return this.generateGoogleChat(input);
    }
    return this.generateOpenAiCompatibleChat(input);
  }

  async createEmbedding(input: EmbeddingInput): Promise<number[][]> {
    const provider = input.provider;
    if (provider === 'cohere') {
      return this.createCohereEmbedding(input);
    }
    if (provider === 'google') {
      return this.createGoogleEmbedding(input);
    }
    if (provider === 'anthropic') {
      throw new Error('Anthropic does not provide text embeddings endpoint');
    }
    return this.createOpenAiCompatibleEmbedding(input);
  }

  private async resolveBaseUrl(
    provider: string,
    providerConfig?: RuntimeConfig,
  ) {
    const cfg: Record<string, unknown> = providerConfig ?? {};
    const cfgBase =
      typeof cfg['base_url'] === 'string' ? cfg['base_url'].trim() : null;

    if (cfgBase) {
      return normalizeSafeOutboundBaseUrl(
        cfgBase,
        `${provider} provider base_url`,
      );
    }
    if (provider === 'anthropic') return 'https://api.anthropic.com/v1';
    if (provider === 'cohere') return 'https://api.cohere.com/v2';
    if (provider === 'google')
      return 'https://generativelanguage.googleapis.com/v1beta';
    if (provider === 'groq') return 'https://api.groq.com/openai/v1';
    if (provider === 'together') return 'https://api.together.xyz/v1';
    if (provider === 'mistral') return 'https://api.mistral.ai/v1';
    if (provider === 'qwen')
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    if (provider === 'kimi') return 'https://api.moonshot.cn/v1';
    if (provider === 'deepseek') return 'https://api.deepseek.com/v1';
    if (provider === 'custom') {
      throw new Error('custom provider requires provider_config.base_url');
    }
    if (provider === 'azure_openai') {
      throw new Error(
        'azure_openai requires provider_config.base_url (for example: https://<resource>.openai.azure.com/openai/v1)',
      );
    }
    return 'https://api.openai.com/v1';
  }

  private async generateOpenAiCompatibleChat(
    input: ChatInput,
  ): Promise<ChatOutput> {
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );
    const isAzure = input.provider === 'azure_openai';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isAzure) {
      headers['api-key'] = input.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${input.apiKey}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      headers,
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Chat request failed (${input.provider}): ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    return {
      text: body.choices?.[0]?.message?.content ?? '',
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? null,
        completionTokens: body.usage?.completion_tokens ?? null,
        totalTokens: body.usage?.total_tokens ?? null,
      },
    };
  }

  private async createOpenAiCompatibleEmbedding(
    input: EmbeddingInput,
  ): Promise<number[][]> {
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );
    const isAzure = input.provider === 'azure_openai';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isAzure) {
      headers['api-key'] = input.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${input.apiKey}`;
    }

    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      redirect: 'error',
      headers,
      body: JSON.stringify({
        model: input.model,
        input: input.input,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Embedding request failed (${input.provider}): ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return (body.data ?? [])
      .map((item) => item.embedding ?? [])
      .filter((vector) => vector.length > 0);
  }

  private async generateAnthropicChat(input: ChatInput): Promise<ChatOutput> {
    const cfg: Record<string, unknown> = input.providerConfig ?? {};
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );
    const anthropicVersion =
      typeof cfg['anthropic_version'] === 'string'
        ? cfg['anthropic_version']
        : '2023-06-01';

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': anthropicVersion,
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 4096,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat request failed (anthropic): ${res.status} ${text}`);
    }

    const body = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    const text = (body.content ?? [])
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text as string)
      .join('\n');

    const prompt = body.usage?.input_tokens ?? null;
    const completion = body.usage?.output_tokens ?? null;
    return {
      text,
      usage: {
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens:
          prompt !== null && completion !== null ? prompt + completion : null,
      },
    };
  }

  private async generateCohereChat(input: ChatInput): Promise<ChatOutput> {
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );

    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat request failed (cohere): ${res.status} ${text}`);
    }

    const body = (await res.json()) as {
      text?: string;
      message?: { content?: Array<{ text?: string }> };
      usage?: {
        tokens?: { input_tokens?: number; output_tokens?: number };
      };
    };

    const text =
      body.text ??
      body.message?.content?.map((item) => item.text ?? '').join('\n') ??
      '';
    const prompt = body.usage?.tokens?.input_tokens ?? null;
    const completion = body.usage?.tokens?.output_tokens ?? null;
    return {
      text,
      usage: {
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens:
          prompt !== null && completion !== null ? prompt + completion : null,
      },
    };
  }

  private async createCohereEmbedding(
    input: EmbeddingInput,
  ): Promise<number[][]> {
    const cfg: Record<string, unknown> = input.providerConfig ?? {};
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );
    const values = Array.isArray(input.input) ? input.input : [input.input];
    const inputType =
      typeof cfg['cohere_input_type'] === 'string'
        ? cfg['cohere_input_type']
        : 'search_document';

    const res = await fetch(`${baseUrl}/embed`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        texts: values,
        input_type: inputType,
        embedding_types: ['float'],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Embedding request failed (cohere): ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as {
      embeddings?: { float?: number[][] } | number[][];
    };

    if (Array.isArray(body.embeddings)) return body.embeddings;
    if (body.embeddings?.float) return body.embeddings.float;
    return [];
  }

  private async generateGoogleChat(input: ChatInput): Promise<ChatOutput> {
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );

    const payload: Record<string, unknown> = {
      contents: [{ parts: [{ text: input.userPrompt }] }],
      generationConfig: {
        temperature: input.temperature,
      },
    };
    if (input.systemPrompt?.trim()) {
      payload['system_instruction'] = {
        parts: [{ text: input.systemPrompt }],
      };
    }

    const res = await fetch(
      `${baseUrl}/models/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': input.apiKey,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat request failed (google): ${res.status} ${text}`);
    }

    const body = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text =
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('\n') ?? '';

    return {
      text,
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount ?? null,
        completionTokens: body.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: body.usageMetadata?.totalTokenCount ?? null,
      },
    };
  }

  private async createGoogleEmbedding(
    input: EmbeddingInput,
  ): Promise<number[][]> {
    const baseUrl = await this.resolveBaseUrl(
      input.provider,
      input.providerConfig,
    );
    const values = Array.isArray(input.input) ? input.input : [input.input];

    const vectors: number[][] = [];
    for (const text of values) {
      const res = await fetch(
        `${baseUrl}/models/${encodeURIComponent(input.model)}:embedContent`,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': input.apiKey,
          },
          body: JSON.stringify({
            content: {
              parts: [{ text }],
            },
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Embedding request failed (google): ${res.status} ${errorText}`,
        );
      }
      const body = (await res.json()) as {
        embedding?: { values?: number[] };
      };
      vectors.push(body.embedding?.values ?? []);
    }
    return vectors;
  }
}
