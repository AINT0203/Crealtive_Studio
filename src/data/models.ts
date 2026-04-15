export type Model = {
  id: string
  name: string
  provider: string
  version: string
  description: string
  costPerUnit: number
  badge: 'Azure' | 'Google'
  /** When set, this id is sent to the Python backend as the Gemini `model` parameter */
  geminiModelId?: string
}

export const models: Model[] = [
  {
    id: 'gpt-image',
    name: 'GPT Image',
    provider: 'Azure OpenAI',
    version: 'GPT Image 1.5',
    description: 'High fidelity, strong instruction following',
    costPerUnit: 60,
    badge: 'Azure',
  },
  {
    id: 'gemini-flash',
    name: 'Gemini Flash',
    provider: 'Google',
    version: 'Gemini 2.5 Flash',
    description: 'Fast, creative, great for stylized edits',
    costPerUnit: 40,
    badge: 'Google',
    geminiModelId: 'gemini-2.5-flash-image',
  },
]

