import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { can } from '@/lib/permissions'
import { db } from '@/lib/db'
import { isRetailLearner } from '@/lib/departments'
import { logout } from '@/actions/auth'
import { getLearningSeed, saveLearningProgress } from '@/actions/learning'
import LearningApp from '@/components/learning/LearningApp'

export const metadata = {
  title: 'iORA Learning Hub',
}

/**
 * The Learning Hub is retail training: the onboarding course teaches shop-floor
 * work, and it was previously open to everyone with a login, which put a course
 * about serving customers in front of the finance and design teams. Retail staff
 * see it; HR reaches it to maintain the content.
 */
export default async function LearningPage() {
  const session = await verifySession()

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { department: true },
  })
  if (!isRetailLearner(me?.department) && !can(session.role, 'learning.admin')) {
    redirect('/dashboard')
  }

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
