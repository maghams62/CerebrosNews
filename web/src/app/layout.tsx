import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CerebrosNews - My Feed",
  description: "CerebrosNews/Inshorts-style news feed with transparency",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var attr = "bis_skin_checked";
    var strip = function(root){
      var scope = root && root.querySelectorAll ? root : document;
      if (scope && scope.nodeType === 1 && scope.hasAttribute && scope.hasAttribute(attr)) {
        scope.removeAttribute(attr);
      }
      var list = scope.querySelectorAll ? scope.querySelectorAll("[" + attr + "]") : [];
      for (var i = 0; i < list.length; i++) {
        list[i].removeAttribute(attr);
      }
    };

    strip(document);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function(){ strip(document); }, { once: true });
    }

    var observer = new MutationObserver(function(mutations){
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === "attributes" && mutation.target) {
          strip(mutation.target);
          continue;
        }
        var nodes = mutation.addedNodes || [];
        for (var j = 0; j < nodes.length; j++) {
          strip(nodes[j]);
        }
      }
    });

    observer.observe(document.documentElement || document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [attr]
    });

    window.addEventListener("load", function(){ strip(document); }, { once: true });
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className={`${inter.className} overflow-hidden overscroll-none`}>
        {children}
      </body>
    </html>
  );
}
