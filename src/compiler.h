#ifndef _FUS_COMPILER_H_
#define _FUS_COMPILER_H_


typedef struct fus_compiler_frame {
    struct fus_compiler_frame *parent;
    int depth;
    char *name;
    fus_code_t code;
} fus_compiler_frame_t;

typedef struct fus_compiler {
    fus_symtable_t *symtable;
    fus_compiler_frame_t *cur_frame;
    ARRAY_DECL(fus_compiler_frame_t, frames)
} fus_compiler_t;


void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame);
int fus_compiler_frame_init(fus_compiler_frame_t *frame,
    fus_compiler_frame_t *parent, const char *name);
void fus_compiler_cleanup(fus_compiler_t *compiler);
int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable);

int fus_compiler_push_frame(fus_compiler_t *compiler, const char *name);
int fus_compiler_compile_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer);


#endif