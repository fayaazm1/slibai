import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

export interface CodeGenRequest {
  tool_name: string
  language: string
  use_case?: string
  category?: string
  tool_function?: string
}

export interface CodeGenResult {
  install_command: string | null
  code: string
  explanation: string
}

export interface CodeExplainResult {
  explanation: string
}

export const generateCode = (body: CodeGenRequest): Promise<CodeGenResult> =>
  api.post('/codegen/generate', body).then(r => r.data)

export const explainCode = (
  code: string,
  language: string,
  tool_name: string,
): Promise<CodeExplainResult> =>
  api.post('/codegen/explain', { code, language, tool_name }).then(r => r.data)
