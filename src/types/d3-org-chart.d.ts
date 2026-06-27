declare module 'd3-org-chart' {

  export class OrgChart<TData = any> {
    container(selector: string | HTMLElement): this
    data(data: TData[]): this
    nodeWidth(fn: (d: { data: TData }) => number): this
    nodeHeight(fn: (d: { data: TData }) => number): this
    nodeContent(fn: (d: { data: TData }) => string): this
    render(): this
    // allow any other methods

    [key: string]: any
  }
}
