#ifndef POKEVIEW_H
#define POKEVIEW_H

#include <QDialog>
#include <QStandardItemModel>

namespace Ui {
class pokeView;
}

class pokeView : public QDialog
{
    Q_OBJECT

public:
    explicit pokeView(QWidget *parent = nullptr);
    ~pokeView();
    void getpoke();
signals:
    void getPoke(QList<QString>&);
public slots:
    void updateTable(QList<QString> &pokeInfo);
private:
    Ui::pokeView *ui;
    QStandardItemModel *pokeModel;
    qint32 rowNum;
};

#endif // POKEVIEW_H
