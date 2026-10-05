import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeCallbackUrl } from "@/lib/utils";
import { enabledSocialProviders } from "@/server/auth";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { callbackUrl } = await props.searchParams;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Bon retour parmi nous</CardTitle>
        <CardDescription>Connectez-vous pour accéder à vos modèles.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm
          callbackUrl={safeCallbackUrl(callbackUrl)}
          socialProviders={enabledSocialProviders}
        />
      </CardContent>
    </Card>
  );
}
