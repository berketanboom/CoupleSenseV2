export const metadata = { title: 'CoupleSense', description: 'AI mediator for couples (Groq edition)' }
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{margin:0}}>{children}</body>
    </html>
  )
}
