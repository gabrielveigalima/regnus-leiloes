export const metadata = { title: "RegnusBot — Regnus Leilões" };

export default function BotPage() {
  const contact = process.env.BOT_CONTACT_EMAIL || process.env.ADMIN_EMAIL || "";
  return (
    <main style={{ maxWidth: 720, margin: "6vh auto", padding: 16, lineHeight: 1.6 }}>
      <h1>RegnusBot</h1>
      <p>O <strong>RegnusBot</strong> é o robô de coleta do sistema <strong>Regnus Leilões</strong> (Grupo Regnus), que reúne anúncios públicos de imóveis em leilão para uso dos nossos analistas.</p>
      <h2>Como ele se comporta</h2>
      <ul>
        <li>Identifica-se com o User-Agent <code>RegnusBot/1.0</code> e um contato.</li>
        <li>Respeita o <code>robots.txt</code> de cada site e não acessa áreas protegidas, com login ou com verificação anti-robô.</li>
        <li>No máximo 1 requisição por segundo por domínio, com espera maior se o servidor pedir (<code>Retry-After</code>).</li>
        <li>Guarda apenas dados públicos do anúncio e sempre aponta para o link original. Não baixa editais, matrículas ou imagens.</li>
      </ul>
      <h2>Contato</h2>
      <p>Se o robô estiver causando problemas ou se você quiser que ele deixe de acessar o seu site, escreva para {contact ? <a href={`mailto:${contact}`}>{contact}</a> : "o contato informado no User-Agent"}. Atendemos o pedido com prioridade.</p>
    </main>
  );
}
