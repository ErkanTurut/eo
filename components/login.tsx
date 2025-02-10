"use client";
import { signIn, signOut } from "next-auth/react";
import Google from "@/components/icons";
import { Button } from "@/components/ui/button";
export function SignInButton() {
  return (
    <Button
      onClick={() => signIn("google")}
      variant={"outline"}
      size={"sm"}
      className=" bg-zinc-100 border-2 border-t-zinc-50 border-l-zinc-100  border-r-zinc-300 border-b-zinc-400 rounded-none hover:border"
    >
      <Google /> Connect to start
    </Button>
  );
}

export function SignoutButton() {
  return (
    <Button
      onClick={() => signOut()}
      variant={"outline"}
      size={"sm"}
      className=" bg-zinc-100 border-2 border-t-zinc-50 border-l-zinc-100  border-r-zinc-300 border-b-zinc-400 rounded-none hover:border"
    >
      <Google /> Signout
    </Button>
  );
}
