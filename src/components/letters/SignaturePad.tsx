'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Undo2, Eraser } from 'lucide-react'

type Point = { x: number; y: number }

type Props = {
  onConfirm: (dataUrl: string) => void
  onCancel?: () => void
  pending?: boolean
}

/**
 * Draw-to-sign pad. The officer draws with mouse/touch/pen; supports undo and
 * clear. On confirm it exports a transparent PNG data URL that gets stamped
 * onto the letter PDF.
 */
export function SignaturePad({ onConfirm, onCancel, pending }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [strokes, setStrokes] = useState<Point[][]>([])
  const drawing = useRef(false)
  const current = useRef<Point[]>([])

  const redraw = useCallback((all: Point[][]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    for (const stroke of all) {
      if (stroke.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    redraw(strokes)
  }, [strokes, redraw])

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    current.current = [pointFrom(e)]
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    current.current.push(pointFrom(e))
    // live draw of the in-progress stroke
    redraw([...strokes, current.current])
  }

  function handleUp() {
    if (!drawing.current) return
    drawing.current = false
    if (current.current.length > 1) {
      setStrokes(prev => [...prev, current.current])
    }
    current.current = []
  }

  function undo() {
    setStrokes(prev => prev.slice(0, -1))
  }

  function clear() {
    setStrokes([])
  }

  function confirm() {
    const canvas = canvasRef.current
    if (!canvas || strokes.length === 0) return
    onConfirm(canvas.toDataURL('image/png'))
  }

  const hasInk = strokes.length > 0

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-white">
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          className="h-[180px] w-full touch-none rounded-lg"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
        />
      </div>
      <p className="text-xs text-muted-foreground">Draw your signature above.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={!hasInk || pending}>
          <Undo2 className="mr-1 h-4 w-4" /> Undo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasInk || pending}>
          <Eraser className="mr-1 h-4 w-4" /> Clear
        </Button>
        <div className="flex-1" />
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={confirm} disabled={!hasInk || pending}>
          {pending ? 'Signing…' : 'Sign & Confirm'}
        </Button>
      </div>
    </div>
  )
}
