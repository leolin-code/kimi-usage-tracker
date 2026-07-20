import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../../i18n.ts";

type Props = Readonly<{
  children: ReactNode;
  /** 出错时显示的区块名称，如「趋势图」 */
  name?: string;
}>;

type State = { message: string | null };

/**
 * 局部错误边界：任一区块（图表/表格等）渲染崩溃时只降级该区块，
 * 避免整页空白。错误信息会输出到控制台便于排查。
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[ErrorBoundary] ${this.props.name ?? "section"} crashed:`, error, info);
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <div
          className="border-border/70 bg-card/70 text-muted-foreground flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border p-4 text-sm"
          role="alert"
        >
          <TriangleAlert className="text-orange size-4" aria-hidden="true" />
          <span>
            {i18n.t("states.sectionError", { name: this.props.name ?? i18n.t("states.section") })}
          </span>
          <span className="max-w-full truncate text-xs opacity-70" title={this.state.message}>
            {this.state.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
