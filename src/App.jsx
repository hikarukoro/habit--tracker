import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

const categoryColors = { health: "#a8d8a8", exercise: "#84b6f4", diet: "#ffcb77", lifestyle: "#f4a4a4" }
const categoryLabels = { health: "健康", exercise: "運動", diet: "食事", lifestyle: "生活習慣" }

const toDateKey = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
const todayKey = toDateKey(new Date())

const getPast7Days = () => Array.from({ length: 7 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return { key: toDateKey(d), label: i === 0 ? "今日" : i === 1 ? "昨日" : `${d.getMonth()+1}/${d.getDate()}` }
})

const calcPoints = (a, b, c, d) => Math.round((a + b + c + d) * 11)

export default function App() {
  const [tab, setTab] = useState("action")
  const [actions, setActions] = useState([])
  const [costs, setCosts] = useState([])
  const [records, setRecords] = useState([])
  const [diaries, setDiaries] = useState([])
  const [emotions, setEmotions] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [loading, setLoading] = useState(true)
  const [showDiaryEditor, setShowDiaryEditor] = useState(false)
  const [editingDiary, setEditingDiary] = useState(null)
  const [diaryMemo, setDiaryMemo] = useState("")
  const [diaryEmotions, setDiaryEmotions] = useState([])
  const [showAddAction, setShowAddAction] = useState(false)
  const [showAddCost, setShowAddCost] = useState(false)
  const [showAddEmotion, setShowAddEmotion] = useState(false)
  const [editingAction, setEditingAction] = useState(null)
  const [editingCost, setEditingCost] = useState(null)
  const [newAction, setNewAction] = useState({ name: "", category: "health", note: "", score_a: 1, score_b: 1, score_c: 1, score_d: 1 })
  const [newCost, setNewCost] = useState({ name: "", points: 0, type: "reward", note: "" })
  const [newEmotion, setNewEmotion] = useState({ name: "", emoji: "", is_positive: true })
  const [exportText, setExportText] = useState("")
  const [showExport, setShowExport] = useState(false)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [a, c, r, d, e] = await Promise.all([
      supabase.from('actions').select('*').eq('is_visible', true).order('created_at'),
      supabase.from('costs').select('*').eq('is_visible', true).order('created_at'),
      supabase.from('records').select('*').order('record_date', { ascending: false }),
      supabase.from('diary').select('*').order('diary_date', { ascending: false }),
      supabase.from('emotions').select('*').eq('is_visible', true).order('is_positive', { ascending: false })
    ])
    setActions(a.data || [])
    setCosts(c.data || [])
    setRecords(r.data || [])
    setDiaries(d.data || [])
    setEmotions(e.data || [])
    setLoading(false)
  }

  const totalPoints = records.reduce((s, r) => s + r.points, 0)
  const earned = records.filter(r => r.points > 0).reduce((s, r) => s + r.points, 0)
  const spent = records.filter(r => r.points < 0).reduce((s, r) => s + Math.abs(r.points), 0)
  const costSpent = records.filter(r => r.item_type === 'cost').reduce((s, r) => s + Math.abs(r.points), 0)
  const rewardSpent = records.filter(r => r.item_type === 'reward').reduce((s, r) => s + Math.abs(r.points), 0)

  const recordAction = async (action) => {
    const { data } = await supabase.from('records').insert({
      item_id: action.id, item_type: 'action', name: action.name, points: action.points, record_date: selectedDate
    }).select()
    if (data) setRecords([...data, ...records])
  }

  const recordCost = async (cost) => {
    const { data } = await supabase.from('records').insert({
      item_id: cost.id, item_type: cost.type, name: cost.name, points: -cost.points, record_date: selectedDate
    }).select()
    if (data) setRecords([...data, ...records])
  }

  const deleteRecord = async (id) => {
    if (!window.confirm('この記録を削除しますか？')) return
    await supabase.from('records').delete().eq('id', id)
    setRecords(records.filter(r => r.id !== id))
  }

  const updateRecordDate = async (id, newDate) => {
    await supabase.from('records').update({ record_date: newDate }).eq('id', id)
    setRecords(records.map(r => r.id === id ? { ...r, record_date: newDate } : r))
  }

  const openDiaryEditor = async (date = selectedDate) => {
    const existing = diaries.find(d => d.diary_date === date)
    if (existing) {
      setEditingDiary(existing)
      setDiaryMemo(existing.memo || "")
      const { data } = await supabase.from('diary_emotions').select('emotion_id').eq('diary_id', existing.id)
      setDiaryEmotions((data || []).map(d => d.emotion_id))
    } else {
      setEditingDiary({ diary_date: date })
      setDiaryMemo("")
      setDiaryEmotions([])
    }
    setShowDiaryEditor(true)
  }

  const saveDiary = async () => {
    let diaryId = editingDiary.id
    if (diaryId) {
      await supabase.from('diary').update({ memo: diaryMemo }).eq('id', diaryId)
    } else {
      const { data } = await supabase.from('diary').insert({
        diary_date: editingDiary.diary_date, memo: diaryMemo
      }).select().single()
      diaryId = data.id
    }
    await supabase.from('diary_emotions').delete().eq('diary_id', diaryId)
    if (diaryEmotions.length > 0) {
      await supabase.from('diary_emotions').insert(
        diaryEmotions.map(eid => ({ diary_id: diaryId, emotion_id: eid }))
      )
    }
    setShowDiaryEditor(false)
    loadAll()
  }

  const toggleEmotion = (id) => {
    if (diaryEmotions.includes(id)) {
      setDiaryEmotions(diaryEmotions.filter(e => e !== id))
    } else if (diaryEmotions.length < 3) {
      setDiaryEmotions([...diaryEmotions, id])
    }
  }

  const saveAction = async () => {
    if (!newAction.name) return
    const points = calcPoints(newAction.score_a, newAction.score_b, newAction.score_c, newAction.score_d)
    if (editingAction) {
      await supabase.from('actions').update({ ...newAction, points }).eq('id', editingAction.id)
    } else {
      await supabase.from('actions').insert({ ...newAction, points })
    }
    setShowAddAction(false)
    setEditingAction(null)
    setNewAction({ name: "", category: "health", note: "", score_a: 1, score_b: 1, score_c: 1, score_d: 1 })
    loadAll()
  }

  const hideAction = async (id) => {
    if (!window.confirm('非表示にしますか？')) return
    await supabase.from('actions').update({ is_visible: false }).eq('id', id)
    loadAll()
  }

  const editAction = (a) => {
    setEditingAction(a)
    setNewAction({ name: a.name, category: a.category, note: a.note || "", score_a: a.score_a, score_b: a.score_b, score_c: a.score_c, score_d: a.score_d })
    setShowAddAction(true)
  }

  const saveCost = async () => {
    if (!newCost.name || !newCost.points) return
    if (editingCost) {
      await supabase.from('costs').update(newCost).eq('id', editingCost.id)
    } else {
      await supabase.from('costs').insert(newCost)
    }
    setShowAddCost(false)
    setEditingCost(null)
    setNewCost({ name: "", points: 0, type: "reward", note: "" })
    loadAll()
  }

  const hideCost = async (id) => {
    if (!window.confirm('非表示にしますか？')) return
    await supabase.from('costs').update({ is_visible: false }).eq('id', id)
    loadAll()
  }

  const editCost = (c) => {
    setEditingCost(c)
    setNewCost({ name: c.name, points: c.points, type: c.type, note: c.note || "" })
    setShowAddCost(true)
  }

  const addEmotion = async () => {
    if (!newEmotion.name || !newEmotion.emoji) return
    await supabase.from('emotions').insert({ ...newEmotion, is_custom: true })
    setNewEmotion({ name: "", emoji: "", is_positive: true })
    setShowAddEmotion(false)
    loadAll()
  }

  const exportCSV = async () => {
    const { data: lastExport } = await supabase.from('export_log').select('*').order('exported_at', { ascending: false }).limit(1).single()
    const since = lastExport?.exported_at || '2000-01-01'
    const newRecords = records.filter(r => new Date(r.created_at) > new Date(since))
    const newDiaries = diaries.filter(d => new Date(d.created_at) > new Date(since))
    
    const lines = ['日付,種別,名前,ポイント']
    newRecords.forEach(r => lines.push(`${r.record_date},${r.item_type},${r.name},${r.points}`))
    
    lines.push('', '日記', '日付,感情,メモ')
    for (const d of newDiaries) {
      const { data: emos } = await supabase.from('diary_emotions').select('emotions(emoji,name)').eq('diary_id', d.id)
      const emoStr = (emos || []).map(e => `${e.emotions.emoji}${e.emotions.name}`).join(' ')
      lines.push(`${d.diary_date},"${emoStr}","${(d.memo || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`)
    }
    
    await supabase.from('export_log').insert({})
    setExportText(lines.join('\n'))
    setShowExport(true)
  }

  const copyExport = () => {
    navigator.clipboard?.writeText(exportText).then(() => alert('コピーしました！Claudeに貼り付けて分析依頼してね'))
  }

  const past7 = getPast7Days()
  const grouped = actions.reduce((acc, a) => { if (!acc[a.category]) acc[a.category] = []; acc[a.category].push(a); return acc }, {})
  const todayRecords = records.filter(r => r.record_date === selectedDate)
  const costRatio = spent > 0 ? Math.round((costSpent / spent) * 100) : 0
  const rewardRatio = spent > 0 ? Math.round((rewardSpent / spent) * 100) : 0

  if (loading) return <div style={{ background: "#0f0f1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>読み込み中...</div>

  const baseStyle = { fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", background: "#0f0f1a", minHeight: "100vh", color: "#f0f0f0", maxWidth: 480, margin: "0 auto", paddingBottom: 80 }

  return (
    <div style={baseStyle}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", padding: "20px 16px 14px" }}>
        <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, marginBottom: 4 }}>HABIT TRACKER</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: totalPoints >= 0 ? "#7ee8a2" : "#f4a4a4" }}>
          {totalPoints.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400, color: "#888", marginLeft: 4 }}>pt</span>
        </div>
        <div style={{ fontSize: 10, color: "#666" }}>獲得 {earned.toLocaleString()} / 消費 {spent.toLocaleString()}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#1a1a2e", borderBottom: "1px solid #ffffff10", overflowX: "auto" }}>
        {[["action", "🎯 アクション"], ["cost", "💸 コスト"], ["reward", "🎁 ご褒美"], ["diary", "📔 日記"], ["log", "📊 分析"], ["setting", "⚙️ 設定"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, minWidth: 70, padding: "10px 4px", fontSize: 10, background: "none", border: "none", color: tab === key ? "#7ee8a2" : "#666", borderBottom: tab === key ? "2px solid #7ee8a2" : "2px solid transparent", cursor: "pointer", fontWeight: tab === key ? 700 : 400, whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Date Selector (for action/cost/reward) */}
      {(tab === "action" || tab === "cost" || tab === "reward") && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>記録する日付</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {past7.map(({ key, label }) => (
              <button key={key} onClick={() => setSelectedDate(key)}
                style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 20, border: `1px solid ${selectedDate === key ? "#7ee8a2" : "#ffffff15"}`, background: selectedDate === key ? "#7ee8a220" : "#1a1a2e", color: selectedDate === key ? "#7ee8a2" : "#888", fontSize: 12, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
          {selectedDate !== todayKey && <div style={{ fontSize: 10, color: "#ffcb77", marginTop: 6 }}>📅 {selectedDate}</div>}
        </div>
      )}

      {/* ACTION TAB */}
      {tab === "action" && (
        <div style={{ padding: 16 }}>
          <button onClick={() => openDiaryEditor()} style={{ width: "100%", background: "#84b6f420", border: "1px solid #84b6f4", color: "#84b6f4", borderRadius: 10, padding: 10, marginBottom: 16, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            📔 {selectedDate === todayKey ? "今日" : selectedDate} の日記を書く
          </button>

          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: categoryColors[cat], letterSpacing: 2, marginBottom: 8, fontWeight: 700 }}>{categoryLabels[cat].toUpperCase()}</div>
              {items.map(a => {
                const count = todayRecords.filter(r => r.item_id === a.id).length
                return (
                  <div key={a.id} style={{ background: "#1a1a2e", border: "1px solid #ffffff10", borderRadius: 12, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => recordAction(a)}
                      style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #ffffff20", background: count > 0 ? "#7ee8a220" : "none", color: count > 0 ? "#7ee8a2" : "#666", fontSize: 14, cursor: "pointer", flexShrink: 0, fontWeight: 700 }}>
                      {count > 0 ? count : "○"}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 9, color: "#666" }}>{a.note}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#7ee8a2" }}>+{a.points}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* COST/REWARD TAB */}
      {(tab === "cost" || tab === "reward") && (
        <div style={{ padding: 16 }}>
          {costs.filter(c => c.type === tab).map(c => (
            <div key={c.id} style={{ background: "#1a1a2e", border: `1px solid ${tab === 'cost' ? '#f4a4a420' : '#ffcb7720'}`, borderRadius: 12, padding: "10px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                {c.note && <div style={{ fontSize: 9, color: "#666" }}>{c.note}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tab === 'cost' ? '#f4a4a4' : '#ffcb77' }}>{c.points.toLocaleString()}pt</div>
                <button onClick={() => recordCost(c)} disabled={tab === 'reward' && totalPoints < c.points}
                  style={{ fontSize: 10, background: tab === 'cost' ? "#f4a4a420" : (totalPoints >= c.points ? "#ffcb7720" : "#ffffff05"), border: `1px solid ${tab === 'cost' ? '#f4a4a4' : (totalPoints >= c.points ? '#ffcb77' : '#333')}`, color: tab === 'cost' ? '#f4a4a4' : (totalPoints >= c.points ? '#ffcb77' : '#444'), borderRadius: 6, padding: "3px 10px", cursor: "pointer", marginTop: 4 }}>
                  {tab === 'cost' ? '記録' : (totalPoints >= c.points ? '消費' : '不足')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DIARY TAB */}
      {tab === "diary" && (
        <div style={{ padding: 16 }}>
          {diaries.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 24, fontSize: 12 }}>まだ日記がありません。アクションタブから書けます。</div>}
          {diaries.map(d => (
            <button key={d.id} onClick={() => openDiaryEditor(d.diary_date)}
              style={{ width: "100%", background: "#1a1a2e", border: "1px solid #ffffff10", borderRadius: 12, padding: 12, marginBottom: 8, textAlign: "left", color: "#f0f0f0", cursor: "pointer" }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{d.diary_date}</div>
              <div style={{ fontSize: 12, color: "#ddd", whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{d.memo || "(メモなし)"}</div>
            </button>
          ))}
        </div>
      )}

      {/* LOG TAB */}
      {tab === "log" && (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>消費分析</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: "#f4a4a415", borderRadius: 8, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f4a4a4" }}>{costRatio}%</div>
                <div style={{ fontSize: 9, color: "#888" }}>コスト型</div>
                <div style={{ fontSize: 10, color: "#f4a4a4" }}>{costSpent.toLocaleString()}pt</div>
              </div>
              <div style={{ flex: 1, background: "#ffcb7715", borderRadius: 8, padding: 10, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#ffcb77" }}>{rewardRatio}%</div>
                <div style={{ fontSize: 9, color: "#888" }}>ご褒美型</div>
                <div style={{ fontSize: 10, color: "#ffcb77" }}>{rewardSpent.toLocaleString()}pt</div>
              </div>
            </div>
            {costRatio > 60 && <div style={{ background: "#f4a4a415", borderRadius: 6, padding: 8, fontSize: 10, color: "#f4a4a4" }}>⚠️ コスト消費多め</div>}
            {rewardRatio > 70 && <div style={{ background: "#7ee8a215", borderRadius: 6, padding: 8, fontSize: 10, color: "#7ee8a2" }}>✨ ご褒美中心</div>}
          </div>

          <button onClick={exportCSV} style={{ width: "100%", background: "#84b6f420", border: "1px solid #84b6f4", color: "#84b6f4", borderRadius: 10, padding: 12, marginBottom: 12, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            📤 前回以降のデータをCSV出力
          </button>

          {showExport && (
            <div style={{ background: "#1a1a2e", border: "1px solid #84b6f440", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <textarea readOnly value={exportText} style={{ width: "100%", height: 180, background: "#0f0f1a", border: "1px solid #ffffff10", color: "#ddd", borderRadius: 6, padding: 8, fontSize: 10, fontFamily: "monospace", boxSizing: "border-box" }} />
              <button onClick={copyExport} style={{ width: "100%", background: "#84b6f430", border: "1px solid #84b6f4", color: "#84b6f4", borderRadius: 6, padding: 8, marginTop: 6, cursor: "pointer", fontSize: 11 }}>📋 コピー</button>
            </div>
          )}

          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>履歴</div>
          {records.slice(0, 50).map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "8px 10px", background: "#1a1a2e", borderRadius: 8, marginBottom: 4, fontSize: 11 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{r.name}</div>
                <input type="date" value={r.record_date} onChange={e => updateRecordDate(r.id, e.target.value)} style={{ background: "transparent", border: "none", color: "#666", fontSize: 10, padding: 0 }} />
              </div>
              <div style={{ fontWeight: 700, color: r.points > 0 ? "#7ee8a2" : "#f4a4a4", marginRight: 8 }}>{r.points > 0 ? "+" : ""}{r.points}</div>
              <button onClick={() => deleteRecord(r.id)} style={{ background: "none", border: "none", color: "#444", fontSize: 14, cursor: "pointer" }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* SETTING TAB */}
      {tab === "setting" && (
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 700 }}>🎯 アクション一覧</div>
          {actions.map(a => (
            <div key={a.id} style={{ background: "#1a1a2e", border: "1px solid #ffffff10", borderRadius: 8, padding: 10, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: "#7ee8a2", fontWeight: 700 }}>+{a.points}pt</div>
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>A:{a.score_a} B:{a.score_b} C:{a.score_c} D:{a.score_d} | 合計{a.score_a+a.score_b+a.score_c+a.score_d}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => editAction(a)} style={{ flex: 1, fontSize: 10, background: "#84b6f420", border: "1px solid #84b6f4", color: "#84b6f4", borderRadius: 6, padding: 4, cursor: "pointer" }}>編集</button>
                <button onClick={() => hideAction(a.id)} style={{ flex: 1, fontSize: 10, background: "none", border: "1px solid #f4a4a440", color: "#f4a4a4", borderRadius: 6, padding: 4, cursor: "pointer" }}>非表示</button>
              </div>
            </div>
          ))}
          <button onClick={() => { setEditingAction(null); setNewAction({ name: "", category: "health", note: "", score_a: 1, score_b: 1, score_c: 1, score_d: 1 }); setShowAddAction(true) }}
            style={{ width: "100%", background: "none", border: "1px dashed #333", color: "#666", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 11, marginBottom: 16 }}>＋ アクション追加</button>

          <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 700 }}>💸 コスト・🎁 ご褒美一覧</div>
          {costs.map(c => (
            <div key={c.id} style={{ background: "#1a1a2e", border: "1px solid #ffffff10", borderRadius: 8, padding: 10, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: c.type === 'cost' ? "#f4a4a4" : "#ffcb77", fontWeight: 700 }}>{c.points.toLocaleString()}pt</div>
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{c.type === 'cost' ? 'コスト型' : 'ご褒美型'}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => editCost(c)} style={{ flex: 1, fontSize: 10, background: "#84b6f420", border: "1px solid #84b6f4", color: "#84b6f4", borderRadius: 6, padding: 4, cursor: "pointer" }}>編集</button>
                <button onClick={() => hideCost(c.id)} style={{ flex: 1, fontSize: 10, background: "none", border: "1px solid #f4a4a440", color: "#f4a4a4", borderRadius: 6, padding: 4, cursor: "pointer" }}>非表示</button>
              </div>
            </div>
          ))}
          <button onClick={() => { setEditingCost(null); setNewCost({ name: "", points: 0, type: "reward", note: "" }); setShowAddCost(true) }}
            style={{ width: "100%", background: "none", border: "1px dashed #333", color: "#666", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 11, marginBottom: 16 }}>＋ コスト・ご褒美追加</button>

          <div style={{ fontSize: 11, color: "#888", marginBottom: 8, fontWeight: 700 }}>😊 感情リスト</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {emotions.map(e => (
              <div key={e.id} style={{ fontSize: 11, padding: "4px 8px", background: e.is_positive ? "#7ee8a215" : "#f4a4a415", border: `1px solid ${e.is_positive ? "#7ee8a240" : "#f4a4a440"}`, borderRadius: 12, color: e.is_positive ? "#7ee8a2" : "#f4a4a4" }}>{e.emoji} {e.name}</div>
            ))}
          </div>
          <button onClick={() => setShowAddEmotion(true)}
            style={{ width: "100%", background: "none", border: "1px dashed #333", color: "#666", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 11 }}>＋ 感情追加</button>
        </div>
      )}

      {/* Diary Editor Modal */}
      {showDiaryEditor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📔 {editingDiary?.diary_date} の日記</div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>感情（3つまで）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {emotions.map(e => (
                <button key={e.id} onClick={() => toggleEmotion(e.id)}
                  style={{ fontSize: 11, padding: "4px 8px", background: diaryEmotions.includes(e.id) ? (e.is_positive ? "#7ee8a240" : "#f4a4a440") : "transparent", border: `1px solid ${diaryEmotions.includes(e.id) ? (e.is_positive ? "#7ee8a2" : "#f4a4a4") : "#333"}`, borderRadius: 12, color: diaryEmotions.includes(e.id) ? (e.is_positive ? "#7ee8a2" : "#f4a4a4") : "#888", cursor: "pointer" }}>
                  {e.emoji} {e.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>メモ（{diaryMemo.length}/300）</div>
            <textarea value={diaryMemo} onChange={e => e.target.value.length <= 300 && setDiaryMemo(e.target.value)}
              style={{ width: "100%", height: 120, background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 8, padding: 8, fontSize: 12, boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={saveDiary} style={{ flex: 1, background: "#7ee8a230", border: "1px solid #7ee8a2", color: "#7ee8a2", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>保存</button>
              <button onClick={() => setShowDiaryEditor(false)} style={{ flex: 1, background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Action Modal */}
      {showAddAction && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 16, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{editingAction ? "編集" : "新規追加"}</div>
            <input placeholder="名前" value={newAction.name} onChange={e => setNewAction({ ...newAction, name: e.target.value })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <input placeholder="メモ" value={newAction.note} onChange={e => setNewAction({ ...newAction, note: e.target.value })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <select value={newAction.category} onChange={e => setNewAction({ ...newAction, category: e.target.value })} style={{ width: "100%", background: "#1a1a2e", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 12 }}>
              <option value="health">健康</option><option value="exercise">運動</option><option value="diet">食事</option><option value="lifestyle">生活習慣</option>
            </select>
            {[["score_a", "A 継続難易度"], ["score_b", "B 身体負荷"], ["score_c", "C 効果"], ["score_d", "D 我慢"]].map(([k, l]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#888", flex: 1 }}>{l}</div>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setNewAction({ ...newAction, [k]: n })}
                    style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid", borderColor: newAction[k] >= n ? "#7ee8a2" : "#333", background: newAction[k] >= n ? "#7ee8a220" : "transparent", color: newAction[k] >= n ? "#7ee8a2" : "#444", fontSize: 10, cursor: "pointer" }}>{n}</button>
                ))}
              </div>
            ))}
            <div style={{ background: "#7ee8a215", borderRadius: 6, padding: 8, textAlign: "center", margin: "10px 0", fontSize: 16, fontWeight: 700, color: "#7ee8a2" }}>
              {calcPoints(newAction.score_a, newAction.score_b, newAction.score_c, newAction.score_d)}pt
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveAction} style={{ flex: 1, background: "#7ee8a230", border: "1px solid #7ee8a2", color: "#7ee8a2", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>保存</button>
              <button onClick={() => setShowAddAction(false)} style={{ flex: 1, background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Cost Modal */}
      {showAddCost && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 16, width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{editingCost ? "編集" : "新規追加"}</div>
            <input placeholder="名前" value={newCost.name} onChange={e => setNewCost({ ...newCost, name: e.target.value })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <input placeholder="ポイント" type="number" value={newCost.points} onChange={e => setNewCost({ ...newCost, points: Number(e.target.value) })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <input placeholder="メモ" value={newCost.note} onChange={e => setNewCost({ ...newCost, note: e.target.value })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <select value={newCost.type} onChange={e => setNewCost({ ...newCost, type: e.target.value })} style={{ width: "100%", background: "#1a1a2e", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 12 }}>
              <option value="cost">コスト型</option><option value="reward">ご褒美型</option>
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveCost} style={{ flex: 1, background: "#7ee8a230", border: "1px solid #7ee8a2", color: "#7ee8a2", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>保存</button>
              <button onClick={() => setShowAddCost(false)} style={{ flex: 1, background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Emotion Modal */}
      {showAddEmotion && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 16, width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>感情を追加</div>
            <input placeholder="絵文字（1文字）" value={newEmotion.emoji} onChange={e => setNewEmotion({ ...newEmotion, emoji: e.target.value })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <input placeholder="名前" value={newEmotion.name} onChange={e => setNewEmotion({ ...newEmotion, name: e.target.value })} style={{ width: "100%", background: "#0f0f1a", border: "1px solid #ffffff20", color: "#f0f0f0", borderRadius: 6, padding: "6px 10px", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setNewEmotion({ ...newEmotion, is_positive: true })} style={{ flex: 1, background: newEmotion.is_positive ? "#7ee8a230" : "transparent", border: `1px solid ${newEmotion.is_positive ? "#7ee8a2" : "#333"}`, color: newEmotion.is_positive ? "#7ee8a2" : "#666", borderRadius: 6, padding: 8, cursor: "pointer", fontSize: 11 }}>陽の感情</button>
              <button onClick={() => setNewEmotion({ ...newEmotion, is_positive: false })} style={{ flex: 1, background: !newEmotion.is_positive ? "#f4a4a430" : "transparent", border: `1px solid ${!newEmotion.is_positive ? "#f4a4a4" : "#333"}`, color: !newEmotion.is_positive ? "#f4a4a4" : "#666", borderRadius: 6, padding: 8, cursor: "pointer", fontSize: 11 }}>陰の感情</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addEmotion} style={{ flex: 1, background: "#7ee8a230", border: "1px solid #7ee8a2", color: "#7ee8a2", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>追加</button>
              <button onClick={() => setShowAddEmotion(false)} style={{ flex: 1, background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, padding: 10, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
