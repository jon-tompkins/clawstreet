import { redirect } from 'next/navigation'

export default function Home() {
  // For now, serve the static landing page
  redirect('/index.html')
}
