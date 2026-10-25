import { parseSourceCode } from '../src/core/parsers/code';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

console.log('Testing Multi-Line Block AST Scanner...');

// 1. Prisma findMany spanning lines
const prismaCode = `
export async function getBookings(id: number) {
  const bookings = await prisma.booking.findMany({
    where: {
      attendeeId: id
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  return bookings;
}
`;
const prismaFindings = parseSourceCode([{ path: 'src/bookings.ts', content: prismaCode }]);
assert(prismaFindings.length >= 1, 'Detects multi-line Prisma query');
assert(prismaFindings.some(f => f.symbol === 'booking.findMany' && f.table === 'booking'), 'Extracts model and op from multi-line block');

// 2. Django ORM N+1 loop spanning lines
const djangoCode = `
def get_recent_events(team):
    events = Event.objects.filter(
        team_id=team.id
    ).exclude(
        status="archived"
    )
    for event in events:
        print(event.person.email)
`;
const djangoFindings = parseSourceCode([{ path: 'api/views.py', content: djangoCode }]);
assert(djangoFindings.length >= 1, 'Detects multi-line Django query with N+1 risk');

// 3. Go Mutex held across I/O
const goCode = `
func (s *Server) HandleStream(w http.ResponseWriter, r *http.Request) {
    s.mu.Lock()
    resp, err := http.Get("https://api.upstream.internal")
    s.mu.Unlock()
}
`;
const goFindings = parseSourceCode([{ path: 'server.go', content: goCode }]);
assert(goFindings.some(f => f.symbol.includes('sync.Mutex')), 'Detects Go mutex held across network call');

// 4. Rails ActiveRecord N+1
const railsCode = `
def sync_posts
  Post.where(
    published: true,
    author_id: 42
  ).each do |post|
    post.comments.count
  end
end
`;
const railsFindings = parseSourceCode([{ path: 'app/controllers/posts_controller.rb', content: railsCode }]);
assert(railsFindings.some(f => f.type === 'N_PLUS_ONE_LOOP'), 'Detects ActiveRecord multi-line N+1 loop');

console.log('All Multi-Line Block AST Scanner tests passed successfully!');
