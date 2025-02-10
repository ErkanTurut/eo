import { Chat } from "@/components/chat";
import { SignInButton, SignoutButton } from "@/components/login";
import { auth } from "./auth";
import { Github } from "@/components/icons";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function Page() {
  const session = await auth();
  return (
    <div className="p-2 flex h-screen flex-col justify-center items-center  ">
      <div className="rounded-none flex flex-col w-full h-full items-center bg-zinc-200 border-4 border-t-zinc-50 border-l-zinc-100  border-r-zinc-400 border-b-zinc-500">
        <div className="w-full flex items-center justify-between p-2">
          <h1 className="font-mono">E/0</h1>
          <div>{session ? <SignoutButton /> : <SignInButton />}</div>
        </div>
        <div className="w-full md:max-w-4xl h-full flex flex-col overflow-hidden md:pb-2 ">
          <Chat />
        </div>
        <div className="flex justify-end items-center w-full absolute bottom-2 right-2">
          <Link href={"https://github.com/ErkanTurut/eo"} className="p-2">
            <Github className="size-6 fill-muted-foreground  hover:fill-zinc-700 transition-colors ease-in " />
          </Link>
        </div>
      </div>
    </div>
  );
}
