import { serve } from "inngest/next";
import { fineTuningFunctions } from "@/features/fine-tuning/server/workflow";
import { inngest } from "@/server/inngest";

// Steps run inside these requests: allow long ones (e.g. starting a GPU run).
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions: fineTuningFunctions });
