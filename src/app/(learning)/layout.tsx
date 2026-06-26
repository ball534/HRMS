import { verifySession } from '@/lib/dal'

// The Learning Hub is a full-page experience with its own top nav and sidebar
// (it is NOT nested inside the HRMS dashboard chrome). This layout only enforces
// authentication — the shared session cookie means a logged-in HRMS user reaches
// it without re-logging in.
export default async function LearningLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await verifySession()
  return <>{children}</>
}
