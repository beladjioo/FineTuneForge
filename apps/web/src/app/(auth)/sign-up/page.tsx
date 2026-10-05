import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { safeCallbackUrl } from "@/lib/utils";
import { enabledSocialProviders } from "@/server/auth";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { callbackUrl } = await props.searchParams;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Créer un compte</CardTitle>
        <CardDescription>Gratuit, sans carte bancaire.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm
          callbackUrl={safeCallbackUrl(callbackUrl)}
          socialProviders={enabledSocialProviders}
        />
      </CardContent>
    </Card>
  );
}
