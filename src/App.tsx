import React from 'react';
import { Router, Link, RouteComponentProps } from "@reach/router"
import './App.css';
import { BaseStyles, CounterLabel, Box, Heading, BorderBox, BranchName, Flex, StyledOcticon } from '@primer/components'
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
        let match  = line.match(/assertion failed: `\(left == right\)`/)
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
            {" "} { test.name }
        </Heading>
        <Box className="stdout">
            <pre><code dangerouslySetInnerHTML={{__html: lines}}></code></pre>
        </Box>
     </BorderBox>;
};

const Render = ({ single, cref }: { single: TestSummary, cref: CommitRef }) => {
    let { ok, failed, ignored } = single;
    let failedKeys = Object.keys(failed).sort();
    let failedOut = failedKeys.map(key => {
        let test = failed[key];
        return <TestFailure key={test.name} test={test} cref={cref} />
    })
    return <Box>
        <Box mb={4}>
            <Text><CounterLabel>{ Object.keys(ok).length }</CounterLabel> ok, <CounterLabel>{ failedKeys.length }</CounterLabel> failed, <CounterLabel>{ Object.keys(ignored).length }</CounterLabel> ignored</Text>
        </Box>
        { failedOut }
    </Box>;
}

let S3_PREFIX = "http://citeproc-rs-test-results.s3-website-ap-southeast-2.amazonaws.com/";
async function fetchSingle(path: string) {
    let res = await fetch(S3_PREFIX + ".snapshots/" + path);
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

type CommitRef = { type: "commits", ref: string } | { type: "branches", ref: string };

const FetchAndRender = ({ commitRef }: { commitRef: CommitRef }) => {
    const [single, setSingle] = useState<TestSummary>();
    const [error, setError] = useState(false);

    useEffect(() => {
        fetchSingle(commitRef.type + "/" + commitRef.ref)
            .then(setSingle)
            .catch(e => {
                setError(e);
            });
    }, [commitRef.ref, commitRef.type]);

    if (error) {
        return <Text>Error loading { commitRef.ref }: <pre><code>{ error.toString() }</code></pre></Text>
    }
    if (!single) {
        return <Text>Loading...</Text>
    }
    return <Box>
        <Heading>
            <BranchName className="branch-heading" href={"https://github.com/cormacrelf/citeproc-rs/tree/" + commitRef.ref}>{ commitRef.ref }</BranchName>
                <br />
            citeproc-rs test results 
        </Heading>
        <Render single={single} cref={commitRef} />
    </Box>;
};

type Routed<T> = RouteComponentProps & Partial<T>;
// </T>

const Nav = () => {
    return <Flex>
        <Link to="/" ><BranchName as="span">master</BranchName></Link>
    </Flex>;
}

const Branch = (props: Routed<{ branch: string }>) => {
    return <Box m={4} p={4}>
        { props.branch ? <FetchAndRender commitRef={{ type: "branches", ref: props.branch }} /> : null }
    </Box>
};

const Commit = (props: Routed<{ commit: string }>) => {
    return <Box m={4} p={4}>
        { props.commit ? <FetchAndRender commitRef={{ type: "commits", ref: props.commit }} /> : null }
    </Box>
};

const App: React.FC = () => {
    return (
        <BaseStyles>
            <Nav />
            <Router>
                <Branch path="/" branch="master" />
                <Branch path="/branches/:branch" />
                <Commit path="/commits/:commit" />
            </Router>
        </BaseStyles>
    );
}

export default App;
