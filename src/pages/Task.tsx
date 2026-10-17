import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadBox } from '@/components/UploadBox'
import { Button } from '@/components/ui/Button'
import { BottomBar } from '@/components/layout/Layout'
import { useDemoStore } from '@/data/store'
import type { Mode } from '@/data/types'
import { cn } from '@/lib/cn'

const MODES: { id: Mode; emoji: string; title: string; desc: string }[] = [
  { id: 'companion', emoji: '👥', title: '同行拍摄', desc: '朋友、伴侣或家人帮你拍' },
  { id: 'selfie', emoji: '📱', title: '自拍模式', desc: '三脚架、自拍杆或定时拍摄' },
]

/**
 * 创建拍摄任务（APP 规格）：
 * - 步骤 1 上传环境照片，步骤 2 选择谁来拍
 * - 主按钮「生成拍摄建议」固定贴底（大拇指热区），内容区预留底部空间
 */
export function Task() {
  const navigate = useNavigate()
  const photo = useDemoStore((s) => s.photo)
  const mode = useDemoStore((s) => s.mode)
  const setPhoto = useDemoStore((s) => s.setPhoto)
  const setMode = useDemoStore((s) => s.setMode)
  const [notice, setNotice] = useState(false)

  const ready = Boolean(photo && mode)

  const generate = () => {
    if (!ready) {
      setNotice(true)
      return
    }
    useDemoStore.getState().startTask()
    navigate('/analysis')
  }

  return (
    <div className="pb-28">
      <p className="text-ink-500">上传当前环境，并告诉 AI 这次由谁来拍。</p>

      <h3 className="mt-6 mb-2 text-base font-semibold">1. 当前环境照片</h3>
      <UploadBox photo={photo} onPhoto={(p) => { setPhoto(p); setNotice(false) }} />

      <h3 className="mt-7 mb-2 text-base font-semibold">2. 谁来拍？</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setNotice(false) }}
            className={cn(
              'rounded-btn border-2 bg-ink-100 px-2.5 py-4 text-center transition',
              mode === m.id ? 'border-primary bg-white' : 'border-transparent hover:bg-ink-150',
            )}
          >
            <span className="text-2xl">{m.emoji}</span>
            <b className="mt-1.5 block text-sm">{m.title}</b>
            <small className="mt-1 block text-xs leading-snug text-ink-500">{m.desc}</small>
          </button>
        ))}
      </div>

      {notice && !ready && (
        <p className="mt-3 text-[13px] text-danger-text">请先添加环境照片并选择拍摄方式。</p>
      )}

      {/* 主操作固定贴底 */}
      <BottomBar>
        <Button disabled={!ready} onClick={generate}>
          生成拍摄建议
        </Button>
      </BottomBar>
    </div>
  )
}
