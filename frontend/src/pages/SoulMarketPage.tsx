import { Result, Typography, Tag } from 'antd'
import { ExperimentOutlined } from '@ant-design/icons'

const { Text } = Typography

/**
 * Soul Market — placeholder. Slot reserved next to Agent Market and
 * Skill Market; the eventual catalog will sell agent "souls" (system
 * prompts / personas / fine-tuned weights — to be defined). For now
 * this page just announces it's on the roadmap so the nav entry
 * exists from day one.
 */
export default function SoulMarketPage() {
  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <Result
        icon={<ExperimentOutlined style={{ color: '#764ba2' }} />}
        title={
          <span>
            Soul Market <Tag color="purple" style={{ marginLeft: 8 }}>敬请期待</Tag>
          </span>
        }
        subTitle={
          <Text type="secondary">
            灵魂市场即将上线 —— 致敬炼金大师 Nicolas Flamel，让你买到 Agent 的"灵魂"（system prompts / personas / 微调权重）。
          </Text>
        }
      />
    </div>
  )
}
