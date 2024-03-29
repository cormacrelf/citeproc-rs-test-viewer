import React, { useMemo } from 'react';
import {
    BrowserRouter as Router,
    Switch,
    Route,
    Link,
    useParams,
    useLocation,
} from "react-router-dom";
import './App.css';
import { BaseStyles, CounterLabel, Box, Heading, BorderBox, BranchName, Flex, StyledOcticon, FilterList, Button } from '@primer/components'
import { Text } from '@primer/components'
import { default as AnsiUp } from 'ansi_up';
import { useState, useEffect } from 'react';
import { Link as OLink } from '@primer/octicons-react';

const ANSI_UP = new AnsiUp();
ANSI_UP.use_classes = false;

interface Test {
    event: string;
    name: string;
    stdout: string | null;
}

type TestEvent = Test & { type: "suite" | "test" };

interface TestSummary {
    test_names: string[];
    ok: { [k: string]: Test },
    failed: { [k: string]: Test },
    ignored: { [k: string]: Test },
}

function testUrl(c: CommitRef, name: string) {
    let matches = name.match(/::(.+.txt)$/);
    if (matches) {
        return `https://github.com/cormacrelf/test-suite/tree/master/processor-tests/humans/${matches[1]}`;
    }
    matches = name.match(/::(.+.ya?ml)$/);
    if (matches) {
        return `https://github.com/cormacrelf/citeproc-rs/tree/${c.ref}/crates/citeproc/tests/data/humans/${matches[1]}`;
    }
}

const TestFailure = ({ test, cref }: { test: Test, cref: CommitRef }) => {
    let stdout = test.stdout;
    let html = "";
    if (stdout != null) {
        html = ANSI_UP.ansi_to_html(stdout);
    }
    let lines = html.split("\n").filter(line => {
        let match = line.match(/assertion failed: `\(left == right\)`/)
            || line.match("RUST_BACKTRACE=1")
            || line.match("<span style=\"font-weight:bold\">Diff</span>")
            || line.match("crates/citeproc/tests/suite.rs");
        let matches = line.length === 0 || (match && match.length > 0);
        return !matches;
    })
        .map(line => line
            .replace('<span style="color:rgb(187,0,0)">&lt;</span>', '<span style="color:rgb(187,0,0)">-</span>')
            .replace('<span style="color:rgb(0,187,0)">&gt;</span>', '<span style="color:rgb(0,187,0)">+</span>')
            .replace(/rgb\(0,95,0\)/g, "#cdffd8")
            .replace(/rgb\(95,0,0\)/g, "#ffdce0")
        )
        .join("\n");
    return <BorderBox p={4}>
        <Heading fontSize={2} id={test.name}>
            <a className="anchor" href={testUrl(cref, test.name)}>
                <StyledOcticon icon={OLink} />
            </a>
            {" "} {test.name}
        </Heading>
        <Box className="stdout">
            <pre><code dangerouslySetInnerHTML={{ __html: lines }}></code></pre>
        </Box>
    </BorderBox>;
};

const Render = ({ single, cref }: { single: TestSummary, cref: CommitRef }) => {
    const [filter, setFilter] = useState<string | null>(null);
    let { ok, failed, ignored } = single;
    let failedKeys = useMemo(() => Object.keys(failed).sort(), [failed]);
    let prefixes = useMemo(() => {
        let hash = {} as { [k: string]: number };
        for (let key of failedKeys) {
            let split0 = key.split("::");
            if (split0.length > 1) {
                let name = split0[1];
                let split = name.split("_");
                if (split.length > 0) {
                    hash[split[0]] = (hash[split[0]] || 0) + 1;
                }
            }
        }
        return hash;
    }, [failedKeys]);
    let filter_ = "::" + filter + "_";
    let filtered = useMemo(() => {
        if (filter !== null) {
            let hash = {} as { [k: string]: boolean };
            for (let key of failedKeys) {
                if (key.indexOf(filter_) === -1) {
                    hash[key] = true;
                }
            }
            return hash
        } else {
            return {};
        }
    }, [failedKeys, filter, filter_])

    let prefixFilters = Object.keys(prefixes).map(prefix => {
        return <FilterList.Item selected={prefix === filter} count={prefixes[prefix]} onClick={() => setFilter(prefix)}>{prefix}</FilterList.Item>
    })
    let failedOut = failedKeys
        .map(key => {
            let test = failed[key];
            return <div className={filtered[test.name] ? "hidden" : undefined} key={test.name} >
                <TestFailure test={test} cref={cref} />
            </div>;
        });
    return (
        <>
            <Box>
                <Text><CounterLabel>{Object.keys(ok).length}</CounterLabel> ok, <CounterLabel>{failedKeys.length}</CounterLabel> failed, <CounterLabel>{Object.keys(ignored).length}</CounterLabel> ignored</Text>
                {filter !== null &&
                    <Button onClick={() => setFilter(null)}>Clear filters</Button>}
            </Box>
            <Flex mb={4}>
                <Box minWidth='220px' pr={4} pt={4}>
                    <FilterList small={true}>
                        {prefixFilters}
                    </FilterList>
                </Box>
                <Box pt={4}>
                    {failedOut}
                </Box>
            </Flex>
        </>
    );
}

async function fetchSingle(url: string) {
    console.warn(url);
    let res = await fetch(url);
    let text = await res.text();
    let events = text.split("\n").filter(x => x.length > 0).map(eventJSON => JSON.parse(eventJSON)) as TestEvent[];
    let summary = {
        test_names: [],
        ok: {},
        failed: {},
        ignored: {}
    } as TestSummary;
    for (let event of events) {
        if (event.type === "test") {
            if (event.event === "failed") {
                summary.failed[event.name] = event;
            } else if (event.event === "ignored") {
                summary.ignored[event.name] = event;
            } else if (event.event === "ok") {
                summary.ok[event.name] = event;
            }
        }
    }
    return summary;
}

class CommitRef {
    constructor(public type: "commits" | "branches" | "url" | "pulls", public ref: string) { }
    kind() {
        if (this.type === "commits") {
            return "commit"
        } else if (this.type === "branches") {
            return "branch"
        } else if (this.type === "pulls") {
            return "pull request"
        } else {
            return this.type
        }
    }
    url(): string {
        if (this.type === "url") {
            return this.ref;
        } else {
            let S3_PREFIX = "https://citeproc-rs-test-results.cormacrelf.net/.snapshots/";
            return `${S3_PREFIX}${this.type}/${this.ref}`
        }
    }
    describe() {
        return `${this.kind()} ${this.ref}`
    }
    treeUrl() {
        if (this.type === "url") {
            return this.ref
        } else if (this.type === "pulls") {
            return `https://github.com/zotero/citeproc-rs/pulls/${this.ref}`
        } else {
            return "https://github.com/zotero/citeproc-rs/tree/" + this.ref
        }
    }
    fetch(): Promise<TestSummary> {
        return fetchSingle(this.url())
    }
}

const FetchAndRender = ({ commitRef }: { commitRef: CommitRef }) => {
    const [single, setSingle] = useState<TestSummary>();
    const [error, setError] = useState(false);

    useEffect(() => {
        commitRef.fetch().then(setSingle).catch(e => setError(e));
    }, [commitRef.url()]);

    if (error) {
        return <Text>Error loading {commitRef.describe()}: <pre><code>{error.toString()}</code></pre></Text>
    }
    if (!single) {
        return <Text>Loading...</Text>
    }
    return <Box>
        <Heading>
            {commitRef.kind()} <BranchName className="branch-heading" href={commitRef.treeUrl()}>{commitRef.ref}</BranchName>
            <br />
            citeproc-rs test results
        </Heading>
        <Render single={single} cref={commitRef} />
    </Box>;
};

const Nav = () => {
    return <Flex>
        <Link to="/" ><BranchName as="span">master</BranchName></Link>
    </Flex>;
}

type Params = { commit?: string, branch?: string, path?: string, pull?: string };

const Master = () => {
    const branch = new CommitRef("branches", "master");
    return <Box m={4} p={4}>
        {branch ? <FetchAndRender commitRef={branch} /> : null}
    </Box>
};

function useQuery() {
    const { search } = useLocation();
    return React.useMemo(() => new URLSearchParams(search), [search]);
}

const Hosted = ({ url }: { url?: string }) => {
    if (!url) {
        const query = useQuery();
        url = query.get("url") || "/no-url?-provided";
    }
    return <Box m={4} p={4}>
        {url ? <FetchAndRender commitRef={new CommitRef("url", url)} /> : null}
    </Box>
};

const Branch = () => {
    const { branch } = useParams<Params>();
    return <Box m={4} p={4}>
        {branch ? <FetchAndRender commitRef={new CommitRef("branches", branch)} /> : null}
    </Box>
};

const PullRequest = () => {
    const { pull } = useParams<Params>();
    return <Box m={4} p={4}>
        {pull ? <FetchAndRender commitRef={new CommitRef("pulls", pull)} /> : null}
    </Box>
};

const Commit = () => {
    const { commit } = useParams<Params>();
    return <Box m={4} p={4}>
        {commit ? <FetchAndRender commitRef={new CommitRef("commits", commit)} /> : null}
    </Box>
};

const App: React.FC = () => {
    return (
        <BaseStyles>
            <Router basename={process.env.PUBLIC_URL}>
                <Nav />
                <Switch>
                    <Route path="/branches/:branch">
                        <Branch />
                    </Route>
                    <Route path="/pulls/:pull">
                        <PullRequest />
                    </Route>
                    <Route path="/commits/:commit">
                        <Commit />
                    </Route>
                    <Route path="/url">
                        <Hosted />
                    </Route>
                    {process.env.HOSTED_SNAPSHOT
                        ? (
                            <Route path="/">
                                <Hosted url={process.env.HOSTED_SNAPSHOT} />
                            </Route>
                        )
                        : null}
                    <Route path="/">
                        <Master />
                    </Route>
                    <Route>
                        {"Route not found"}
                    </Route>
                </Switch>
            </Router>
        </BaseStyles>
    );
}

export default App;
