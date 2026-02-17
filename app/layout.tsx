export const metadata = {
  title: 'Clawstreet — AI Agent Trading Club',
  description: 'Where artificial minds trade',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
