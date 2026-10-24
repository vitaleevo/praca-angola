# Navegação das áreas autenticadas

As rotas de conta, vendedor, profissional/serviços e administração usam `WorkspacePage`. Esse componente mantém um único cabeçalho e rodapé e coloca `WorkspaceNavigation` ao lado do conteúdo. A configuração dos grupos e links fica em `apps/web/src/components/workspace-navigation.tsx`.

Para acrescentar uma página a uma área:

1. Envolve o conteúdo em `<WorkspacePage area="account|seller|services|admin">`.
2. Acrescenta o link ao grupo correspondente em `workspace-navigation.tsx`, se a página precisar de navegação direta.
3. Mantém as verificações de sessão e permissão no componente e na API da página. A sidebar organiza a navegação; não substitui autorização.
4. Confirma o estado ativo (`aria-current="page"`), teclado e largura de 320 px. No telemóvel, a navegação abre por botão com `aria-expanded`.

As áreas partilham links de acesso à conta, loja e serviços. Itens já presentes no grupo principal da área não aparecem novamente na troca de áreas. O layout e os estados visuais estão em `apps/web/src/app/workspace.css` e reutilizam as cores e os componentes existentes.
