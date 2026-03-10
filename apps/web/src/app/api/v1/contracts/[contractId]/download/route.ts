import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, notFound } from "@/lib/api-utils";
import { getContract, contractToPlainText } from "@/services/contracts";

/**
 * GET /api/v1/contracts/[contractId]/download
 * Download contract as plain text (PDF generation requires @react-pdf/renderer).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { contractId } = await params;
  const contract = await getContract(ctx.workspaceId, contractId);
  if (!contract) return notFound("Contract not found");

  const text = contractToPlainText(contract);
  const filename = `${contract.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.txt`;

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
