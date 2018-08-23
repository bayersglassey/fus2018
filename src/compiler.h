#ifndef _FUS_COMPILER_H_
#define _FUS_COMPILER_H_


typedef struct fus_compiler_frame {
    int i;
    bool compiled;
    bool is_module;
    struct fus_compiler_frame *module;
    struct fus_compiler_frame *parent;
    int depth;
    char *name;
    fus_code_t code;
} fus_compiler_frame_t;

typedef struct fus_compiler {
    fus_symtable_t *symtable;
    fus_compiler_frame_t *cur_module;
    fus_compiler_frame_t *cur_frame;
    ARRAY_DECL(fus_compiler_frame_t*, frames)
} fus_compiler_t;


void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame);
int fus_compiler_frame_init(fus_compiler_frame_t *frame, int i,
    fus_compiler_frame_t *module,
    fus_compiler_frame_t *parent,
    char *name, fus_signature_t *sig, bool is_module);
void fus_compiler_cleanup(fus_compiler_t *compiler);
int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable);

int fus_compiler_get_frame(fus_compiler_t *compiler, int i,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t *module, char *name,
    fus_signature_t *sig, bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_push_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t *frame);
int fus_compiler_pop_frame(fus_compiler_t *compiler);
int fus_compiler_compile_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer);
int fus_compiler_find_frame(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_or_add_frame(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    fus_signature_t *sig, bool is_module, fus_compiler_frame_t **frame_ptr);


#endif