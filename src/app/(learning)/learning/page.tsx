import { verifySession } from '@/lib/dal'
import { logout } from '@/actions/auth'
import { getLearningSeed, saveLearningProgress } from '@/actions/learning'
import LearningApp from '@/components/learning/LearningApp'

export const metadata = {
  title: 'iORA Learning Hub',
}

export default async function LearningPage() {
  const session = await verifySession()
  const seed = await getLearningSeed()

  return (
    <>
      {/* Course fonts used by the ported LMS stylesheet. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&family=Cormorant+Garamond:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap"
      />
      <LearningApp
        seed={seed}
        profileHref={`/people/${session.userId}`}
        saveLearning={saveLearningProgress}
        onLogout={logout}
      />
    </>
  )
}
