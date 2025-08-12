'use client'
export const dynamic = 'force-dynamic'
import { useEffect } from 'react'
export default function Page(){
  useEffect(()=>{
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
  },[])
  return (
    <div style={{position:'fixed', inset:0}}>
      <iframe src="/app.html" style={{border:'none', width:'100%', height:'100%'}} />
    </div>
  )
}
