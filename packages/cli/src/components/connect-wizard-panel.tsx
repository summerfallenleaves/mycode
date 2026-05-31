/**
 * @fileoverview ConnectWizardPanel: multi-step /connect wizard for configuring a new LLM provider
 * @module @my-agent/cli/src/components/connect-wizard-panel
 */
import { Box, Text } from 'ink'
import type { JSX } from 'react'

export type ConnectStep = 'format' | 'url' | 'model' | 'apikey' | 'name' | 'done' | null

export interface ConnectConfig {
  format?: 'openai' | 'anthropic'
  baseUrl?: string
  model?: string
  apiKey?: string
  providerName?: string
}

export function ConnectWizardPanel({
  step,
  config,
  selectIdx,
}: {
  step: ConnectStep
  config: ConnectConfig
  selectIdx: number
}): JSX.Element | null {
  if (!step) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
      <Box>
        <Text bold color="magenta"> /connect </Text>
        <Text dimColor>  按 ESC 取消</Text>
      </Box>
      {step === 'format' && (
        <Box marginTop={1} flexDirection="column">
          <Text>选择 API 格式：</Text>
          <Box marginTop={1} flexDirection="column">
            <Text inverse={selectIdx === 0} color={selectIdx === 0 ? 'cyan' : undefined}>
              {' '}{selectIdx === 0 ? '▸' : ' '} OpenAI 兼容格式{' '}
            </Text>
            <Text inverse={selectIdx === 1} color={selectIdx === 1 ? 'cyan' : undefined}>
              {' '}{selectIdx === 1 ? '▸' : ' '} Anthropic 格式{' '}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Tab/↑↓ 选择，Enter 确认</Text>
          </Box>
        </Box>
      )}
      {step === 'url' && (
        <Box marginTop={1} flexDirection="column">
          <Text>输入 Base URL：</Text>
          <Box marginTop={1}>
            <Text dimColor>例如：https://api.openai.com/v1</Text>
          </Box>
        </Box>
      )}
      {step === 'model' && (
        <Box marginTop={1} flexDirection="column">
          <Text>输入模型名称：</Text>
          <Box marginTop={1}>
            <Text dimColor>例如：gpt-5.2, claude-sonnet-4-20250514</Text>
          </Box>
        </Box>
      )}
      {step === 'apikey' && (
        <Box marginTop={1} flexDirection="column">
          <Text>输入 API Key：</Text>
          <Box marginTop={1}>
            <Text dimColor>也可以通过环境变量 MYCODE_API_KEY 设置</Text>
          </Box>
        </Box>
      )}
      {step === 'name' && (
        <Box marginTop={1} flexDirection="column">
          <Text>为这个模型配置命名：</Text>
          <Box marginTop={1}>
            <Text dimColor>例如：my-gpt, work-claude</Text>
          </Box>
        </Box>
      )}
      {step === 'done' && (
        <Box marginTop={1} flexDirection="column">
          {config.providerName?.startsWith('错误') ? (
            <Text color="red">连接失败：{config.providerName}</Text>
          ) : (
            <>
              <Text color="green">✓ 已连接：{config.providerName}</Text>
              <Box marginTop={1}>
                <Text dimColor>格式：{config.format} | 模型：{config.model}</Text>
              </Box>
              <Box marginTop={1}>
                <Text dimColor>按任意键返回</Text>
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  )
}
