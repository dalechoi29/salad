"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import anim1 from "@/assets/animations/loading-1.json";
import anim2 from "@/assets/animations/loading-2.json";
import anim3 from "@/assets/animations/loading-3.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const ANIMATIONS = [anim1, anim2, anim3];

export default function Loading() {
  const [data] = useState(
    () => ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)]
  );

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center">
        <div style={{ width: 120, height: 120 }}>
          <Lottie
            animationData={data}
            loop
            autoplay
            style={{ width: 120, height: 120 }}
          />
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">신선하게 준비 중이에요!</p>
      </div>
    </div>
  );
}
