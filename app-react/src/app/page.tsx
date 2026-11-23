import { redirect } from 'next/navigation';

// The home page of jehre.com is not migrated yet: this app starts at the account.
export default function Home() {
  redirect('/compte/');
}
