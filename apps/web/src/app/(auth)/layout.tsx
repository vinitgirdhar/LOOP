/*
  Auth screens are full-bleed: AuthCard owns the whole viewport, hero and
  sheet both, so this layout adds nothing but the landmark.
*/
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main id="main">{children}</main>;
}
