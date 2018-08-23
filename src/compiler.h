#ifndef _FUS_COMPILER_H_
#define _FUS_COMPILER_H_


enum {
    FUS_COMPILER_FRAME_TYPE_NONE,
    FUS_COMPILER_FRAME_TYPE_DEF,
    FUS_COMPILER_FRAME_TYPE_REF,
    FUS_COMPILER_FRAME_TYPE_SIG,
    FUS_COMPILER_FRAME_TYPES
};

typedef struct fus_compiler_frame {
    int i;
    struct fus_compiler_frame *module;
    struct fus_compiler_frame *parent;
    int depth;
    char *name;
    int type;
    union {
        struct {
            bool compiled;
            bool is_module;
            fus_code_t code;
        } def;
        fus_signature_t sig;
        struct fus_compiler_frame *ref;
    } data;
} fus_compiler_frame_t;

typedef struct fus_compiler {
    fus_symtable_t *symtable;
    fus_compiler_frame_t *cur_module;
    fus_compiler_frame_t *cur_frame;
    fus_compiler_frame_t *root_frame;
    ARRAY_DECL(fus_compiler_frame_t*, frames)
} fus_compiler_t;


void fus_compiler_frame_cleanup(fus_compiler_frame_t *frame);
int fus_compiler_frame_init(fus_compiler_frame_t *frame, int i,
    fus_compiler_frame_t *module,
    fus_compiler_frame_t *parent,
    char *name);
int fus_compiler_frame_init_def(fus_compiler_frame_t *frame,
    fus_signature_t *sig, bool is_module);
int fus_compiler_frame_init_sig(fus_compiler_frame_t *frame,
    fus_signature_t *sig);
void fus_compiler_cleanup(fus_compiler_t *compiler);
int fus_compiler_init(fus_compiler_t *compiler, fus_symtable_t *symtable);

fus_signature_t *fus_compiler_find_sig(fus_compiler_t *compiler,
    const char *token, int token_len);
int fus_compiler_parse_sig(fus_compiler_t *compiler,
    fus_lexer_t *lexer, fus_signature_t *sig_ptr);
int fus_compiler_get_root_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_get_frame(fus_compiler_t *compiler, int i,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame(fus_compiler_t *compiler,
    fus_compiler_frame_t *module, char *name,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *module, char *name,
    fus_signature_t *sig, bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_add_frame_sig(fus_compiler_t *compiler,
    fus_compiler_frame_t *module, char *name,
    fus_signature_t *sig, fus_compiler_frame_t **frame_ptr);
int fus_compiler_push_frame_def(fus_compiler_t *compiler,
    fus_compiler_frame_t *frame);
int fus_compiler_pop_frame_def(fus_compiler_t *compiler);
int fus_compiler_compile_from_lexer(fus_compiler_t *compiler,
    fus_lexer_t *lexer);
int fus_compiler_find_frame(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_frame_def(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_or_add_frame_def(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    fus_signature_t *sig, bool is_module, fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_frame_sig(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    fus_compiler_frame_t **frame_ptr);
int fus_compiler_find_or_add_frame_sig(
    fus_compiler_t *compiler, fus_compiler_frame_t *module,
    const char *token, int token_len,
    fus_signature_t *sig, fus_compiler_frame_t **frame_ptr);


#endif