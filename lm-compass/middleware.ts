import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, NextFetchEvent } from 'next/server'
import type { NextRequest } from 'next/server'

const clerk = clerkMiddleware()

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  try {
    return await clerk(request, event)
  } catch (error) {
    console.error('[Middleware Error]', error)
    return NextResponse.json(
      {
        error: 'Middleware error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}

